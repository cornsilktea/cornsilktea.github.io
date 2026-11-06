interface FrFishingHost {
  rodTier(): FrTier;
  cast(): FrRollResult | null;
  onCatch(roll: FrRollResult): void;
  onClose(): void;
}

type FrFishPhase = "waiting" | "fake" | "bite" | "rhythm" | "caught" | "escaped";

class FrFishingSession {
  static readonly LEAD_SECONDS = 0.9;
  static readonly FAKE_WINDOW = 0.55;
  static readonly BITE_PRESS_GRACE = 0.9;
  phase: FrFishPhase = "waiting";
  elapsed = 0;
  readonly biteAt: number;
  readonly fakeTimes: number[];
  readonly beatTimes: number[] = [];
  hits = 0;
  private resolved = 0;
  private escapedAt = 0;

  constructor(readonly tier: FrTier, readonly roll: FrRollResult, random: FrRandom) {
    this.biteAt = FrFishingRules.biteSeconds(tier, random);
    const fakeCount = random.between(0, 3);
    this.fakeTimes = [];
    for (let i = 0; i < fakeCount; i++) this.fakeTimes.push(0.9 + random.next() * Math.max(0.1, this.biteAt - 2.2));
    this.fakeTimes.sort((a, b) => a - b);
    const beats = FrFishingRules.beatsFor(roll.item);
    for (let k = 0; k < beats; k++) this.beatTimes.push(this.biteAt + FrFishingSession.LEAD_SECONDS + k * FrBalance.FISH_BEAT_INTERVAL);
  }

  get tolerance(): number { return FrBalance.ROD_BEAT_TOLERANCE[this.tier]; }
  get beats(): number { return this.beatTimes.length; }

  fakeActive(): boolean { return this.fakeTimes.some((t) => this.elapsed >= t && this.elapsed < t + FrFishingSession.FAKE_WINDOW); }

  tick(dt: number): void {
    if (this.phase === "caught") return;
    this.elapsed += dt;
    if (this.phase === "escaped") return;
    if (this.phase === "waiting" || this.phase === "fake") this.phase = this.fakeActive() ? "fake" : "waiting";
    if (this.elapsed >= this.biteAt && (this.phase === "waiting" || this.phase === "fake")) this.phase = "bite";
    if (this.phase === "bite" && this.elapsed >= this.biteAt + FrFishingSession.LEAD_SECONDS - 0.4) this.phase = "rhythm";
    if (this.phase === "rhythm" && this.resolved < this.beatTimes.length && this.elapsed > this.beatTimes[this.resolved] + this.tolerance) this.escape();
    if (this.phase === "bite" && this.elapsed > this.biteAt + FrFishingSession.BITE_PRESS_GRACE + 2) this.escape();
  }

  press(): "ignored" | "hit" | "miss" | "caught" {
    if (this.phase === "caught" || this.phase === "escaped") return "ignored";
    if (this.phase === "waiting" || this.phase === "fake") { this.escape(); return "miss"; }
    const target = this.beatTimes[this.resolved];
    if (target === undefined) return "ignored";
    if (!FrFishingRules.beatHit(this.elapsed - target, this.tier)) { this.escape(); return "miss"; }
    this.resolved += 1;
    this.hits += 1;
    if (this.resolved >= this.beatTimes.length) { this.phase = "caught"; return "caught"; }
    return "hit";
  }

  private escape(): void { this.phase = "escaped"; this.escapedAt = this.elapsed; }
  escapedFor(): number { return this.phase === "escaped" ? this.elapsed - this.escapedAt : 0; }
  nextBeat(): number { return this.resolved < this.beatTimes.length ? this.beatTimes[this.resolved] : -1; }
}

class FrFishingScreen {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly hint: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private session: FrFishingSession | null = null;
  private host: FrFishingHost | null = null;
  private cardTimer = 0;
  private flash = 0;

  constructor(private readonly random: FrRandom) {
    this.root = FrDom.make("div", "fr-fishing");
    this.root.hidden = true;
    this.canvas = FrDom.make("canvas");
    this.canvas.width = 720;
    this.canvas.height = 440;
    this.hint = FrDom.make("div", "fr-fishing-hint");
    this.card = FrDom.make("div", "fr-fishing-card");
    this.card.hidden = true;
    const exit = FrDom.make("button", "fr-btn fr-fishing-exit", "나가기");
    exit.type = "button";
    exit.addEventListener("click", () => this.close());
    const pull = FrDom.make("button", "fr-fishing-pull", "당기기");
    pull.type = "button";
    pull.addEventListener("touchstart", (event) => { event.preventDefault(); this.pull(); }, { passive: false });
    pull.addEventListener("mousedown", () => this.pull());
    this.root.append(this.canvas, this.hint, this.card, exit, pull);
    document.body.appendChild(this.root);
  }

  get active(): boolean { return !this.root.hidden; }

  open(host: FrFishingHost): void {
    this.host = host;
    this.root.hidden = false;
    this.recast();
  }

  close(): void {
    this.root.hidden = true;
    this.session = null;
    window.clearTimeout(this.cardTimer);
    if (this.host) this.host.onClose();
  }

  private recast(): void {
    if (!this.host) return;
    const roll = this.host.cast();
    if (!roll) { this.close(); return; }
    this.card.hidden = true;
    this.session = new FrFishingSession(this.host.rodTier(), roll, this.random);
  }

  pull(): void {
    if (!this.active) return;
    const session = this.session;
    if (!session) return;
    const result = session.press();
    this.flash = result === "miss" ? -1 : result === "ignored" ? 0 : 1;
    if (result === "caught") this.showCatch(session.roll);
  }

  private showCatch(roll: FrRollResult): void {
    if (!this.host) return;
    this.host.onCatch(roll);
    FrDom.clear(this.card);
    const grade = FrItemNames.grade(roll.item);
    this.card.style.borderColor = FrItemNames.GRADE_COLORS[grade];
    this.card.append(FrIcons.image(roll.item, 72), FrDom.make("b", "", FrItemNames.label(roll.item)), FrDom.make("span", "", grade === "legend" ? "전설!" : grade === "rare" ? "희귀" : "일반"));
    this.card.hidden = false;
    this.cardTimer = window.setTimeout(() => this.recast(), 1900);
  }

  update(dt: number): void {
    if (!this.active) return;
    const session = this.session;
    if (!session) return;
    session.tick(dt);
    this.flash *= Math.max(0, 1 - dt * 5);
    if (session.phase === "escaped" && session.escapedFor() > 0.9) this.recast();
    this.draw(session);
  }

  private hintFor(session: FrFishingSession): string {
    if (session.phase === "waiting" || session.phase === "fake") return "물고기를 기다려요… 찌가 쏙 잠길 때까지";
    if (session.phase === "bite") return "입질이다! 곧 리듬이 나와요";
    if (session.phase === "rhythm") return "원이 가운데 고리에 겹칠 때 당기기!" + (session.beats > 1 ? "  (" + (session.hits + 1) + "/" + session.beats + ")" : "");
    if (session.phase === "caught") return "잡았다!";
    return "";
  }

  private draw(session: FrFishingSession): void {
    const g = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    const W = this.canvas.width, H = this.canvas.height;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1d5f9e");
    sky.addColorStop(1, "#0b2d52");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const t = session.elapsed;
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { g.beginPath(); for (let x = 0; x <= W; x += 20) { const y = 70 + i * 42 + Math.sin(x * 0.018 + t * 1.3 + i) * 6; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    const cx = W / 2, cy = H * 0.5;
    this.drawShadow(g, session, cx, cy);
    const dip = session.phase === "bite" || session.phase === "rhythm" ? 14 + Math.sin(t * 30) * 4 : session.phase === "fake" ? 7 + Math.sin(t * 40) * 3 : Math.sin(t * 2.2) * 3;
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(cx, cy + dip, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e0463f";
    g.beginPath(); g.arc(cx, cy + dip - 4, 12, Math.PI, 0); g.fill();
    if (session.phase === "bite" || session.phase === "rhythm") this.drawSplash(g, cx, cy, t);
    if (session.phase === "rhythm" || (session.phase === "bite" && t > session.biteAt)) this.drawRings(g, session, cx, cy);
    if (this.flash !== 0) { g.fillStyle = this.flash > 0 ? "rgba(155,224,138," + this.flash * 0.35 + ")" : "rgba(30,30,40," + -this.flash * 0.3 + ")"; g.fillRect(0, 0, W, H); }
    this.hint.textContent = this.hintFor(session);
  }

  private drawShadow(g: CanvasRenderingContext2D, session: FrFishingSession, cx: number, cy: number): void {
    if (session.phase === "caught") return;
    const grade = FrItemNames.grade(session.roll.item);
    const size = grade === "legend" ? 74 : grade === "rare" ? 52 : 36;
    const approach = Math.min(1, session.elapsed / Math.max(0.5, session.biteAt));
    const x = cx - 240 * (1 - approach) + Math.sin(session.elapsed * 2) * 12;
    const y = cy + 24 + Math.sin(session.elapsed * 1.4) * 10;
    g.fillStyle = "rgba(5,20,40,0.55)";
    g.beginPath(); g.ellipse(x, y, size, size * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - size, y); g.lineTo(x - size - size * 0.6, y - size * 0.3); g.lineTo(x - size - size * 0.6, y + size * 0.3); g.closePath(); g.fill();
  }

  private drawSplash(g: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = 3;
    for (let i = 0; i < 3; i++) { const r = ((t * 60 + i * 22) % 66); g.globalAlpha = 1 - r / 66; g.beginPath(); g.arc(cx, cy + 10, 16 + r, 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = 1;
  }

  private drawRings(g: CanvasRenderingContext2D, session: FrFishingSession, cx: number, cy: number): void {
    const targetRadius = 38;
    g.lineWidth = 6;
    g.strokeStyle = "#9BE08A";
    g.beginPath(); g.arc(cx, cy, targetRadius, 0, Math.PI * 2); g.stroke();
    const next = session.nextBeat();
    session.beatTimes.forEach((beat, k) => {
      const remaining = beat - session.elapsed;
      if (remaining < -session.tolerance || remaining > FrBalance.FISH_BEAT_INTERVAL + 0.5) return;
      const radius = targetRadius + Math.max(0, remaining) / FrBalance.FISH_BEAT_INTERVAL * 120;
      g.strokeStyle = beat === next ? "#FFFFFF" : "rgba(255,255,255,0.45)";
      g.lineWidth = beat === next ? 7 : 4;
      g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.stroke();
      if (k < 0) return;
    });
  }
}
