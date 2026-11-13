interface BbPlayerRecord extends RkPlayerRecord {
  sheet: BbTeamSheet;
  vs?: BbVersusCard;
}

interface BbRoomSetup {
  mode: BbGameMode;
  level: BbAiLevelId;
  ai: boolean;
}

interface BbRoomMatch {
  id: number;
  seats: { s0: string; s1: string };
  sheets: [BbTeamSheet, BbTeamSheet];
  names: [string, string];
  level: BbAiLevelId;
  looks?: [CharacterLook, CharacterLook];
}

interface BbRoomEnd {
  winner: 0 | 1;
  match: number;
}

interface BbNetPitch { t: BbPitchId; u: number; v: number }
interface BbNetRoll { seed: number; at: number }
interface BbNetSwing { k: "take" | "swing"; o?: number }
interface BbNetEntry { p?: BbNetPitch; r?: BbNetRoll; s?: BbNetSwing }

class BbRoomRules {
  static readonly AI_SEAT = "ai";
  static readonly RULES: RkRoomRules = { root: "baseballduel/rooms", seatCount: 2, spectatorSlot: 9, seatOrder: [0, 1], spectatorLimit: 8 };
  static readonly VALUES: readonly string[] = ["match", "setup", "end", "vsAt", "assign", "flip"];
  static readonly HOST_TEAM = 1;
  static readonly BLANK_SETUP: BbRoomSetup = { mode: "match", level: "normal", ai: false };

  static assignSeats(plan: MkMatchPlan): Record<string, number> {
    const assign: Record<string, number> = {};
    plan.groups.forEach((group) => MkSeatAssign.peopleOf(group).slice(0, 1).forEach((id) => { assign[id] = group.code === plan.binder ? BbRoomRules.HOST_TEAM : 0; }));
    return assign;
  }

  static assignedTo(assign: Record<string, number> | null, team: 0 | 1): string | null {
    if (!assign) return null;
    return Object.keys(assign).find((id) => Number(assign[id]) === team) || null;
  }

  static setupOf(value: BbRoomSetup | null): BbRoomSetup {
    if (!value || !BbAiLevel.ALL[value.level] || BbModeRules.ORDER.indexOf(value.mode) < 0) return BbRoomRules.BLANK_SETUP;
    return { mode: value.mode, level: value.level, ai: !!value.ai };
  }

  static sideLabels(flip: boolean): [string, string] {
    return flip ? ["손님 · 말 공격", "방장 · 초 공격"] : ["손님 · 초 공격", "방장 · 말 공격"];
  }

  static seatIds(guest: string | null, host: string | null, flip: boolean): [string | null, string | null] {
    return flip ? [host, guest] : [guest, host];
  }

  static teamOf(match: BbRoomMatch, id: string): 0 | 1 | null { return match.seats.s0 === id ? 0 : match.seats.s1 === id ? 1 : null; }

  static seatsFor(match: BbRoomMatch, myId: string, hosting: boolean): [BbSeatKind, BbSeatKind] {
    const kind = (id: string): BbSeatKind => (id === myId ? "human" : id === BbRoomRules.AI_SEAT && hosting ? "ai" : "remote");
    return [kind(match.seats.s0), kind(match.seats.s1)];
  }
}

class BbRoomLink implements BbMatchLink {
  private static readonly FRESH_MS = 2500;
  private static readonly TAKE_AFTER_MS = 7000;
  private static readonly AIM_REACH = 3;
  private readonly entries = new Map<number, BbNetEntry>();
  private readonly asked = new Set<number>();
  private readonly log: FirebaseRef;
  private readonly onEntry = (snapshot: FirebaseSnapshot): void => { this.entries.set(Number(snapshot.key), snapshot.val<BbNetEntry>() || {}); this.pump(); };
  private held = false;

  constructor(private readonly director: BbMatchDirector, private readonly session: RkSession<BbPlayerRecord>, private readonly backend: RkBackend) {
    this.log = session.ref.child("log");
  }

  async open(): Promise<BbLogEntry[]> {
    const snapshot = await this.log.once("value"), stored = snapshot.val<Record<string, BbNetEntry>>() || {};
    Object.keys(stored).forEach((key) => this.entries.set(Number(key), stored[key]));
    this.log.on("child_added", this.onEntry);
    this.log.on("child_changed", this.onEntry);
    const done: BbLogEntry[] = [];
    for (let sequence = 0; ; sequence++) {
      const entry = this.entries.get(sequence);
      if (!entry || !entry.p || !entry.r || !entry.s) return done;
      done.push({ pitch: BbRoomLink.pitchOf(entry.p), aim: BbRoomLink.aimOf(entry.p), seed: entry.r.seed >>> 0, contactOffset: BbRoomLink.offsetOf(entry.s) });
    }
  }

  close(): void {
    this.log.off("child_added", this.onEntry);
    this.log.off("child_changed", this.onEntry);
  }

  hold(on: boolean): void { this.held = on; }

  pitchChosen(sequence: number, call: BbPitchCall): void {
    this.claim(sequence + "/p", { t: call.pitch, u: Number(call.aim.u.toFixed(4)), v: Number(call.aim.v.toFixed(4)) });
  }

  swingChosen(sequence: number, contactOffset: number | null): void {
    this.director.deliverSwing(sequence, contactOffset);
    this.claim(sequence + "/s", contactOffset === null ? { k: "take" } : { k: "swing", o: Number(contactOffset.toFixed(4)) });
  }

  pump(): void {
    const sequence = this.director.sequence, entry = this.entries.get(sequence), hosting = this.session.isHost();
    if (!entry || !entry.p) return;
    if (!entry.r) {
      if (hosting && !this.asked.has(sequence)) { this.asked.add(sequence); this.claim(sequence + "/r", { seed: Math.floor(Math.random() * 4294967296), at: this.backend.now() }); }
      return;
    }
    const age = this.backend.now() - entry.r.at;
    if (this.director.awaitsPitch) this.director.deliverPitch(sequence, { pitch: BbRoomLink.pitchOf(entry.p), aim: BbRoomLink.aimOf(entry.p) }, entry.r.seed >>> 0, age < BbRoomLink.FRESH_MS);
    if (entry.s) this.director.deliverSwing(sequence, BbRoomLink.offsetOf(entry.s));
    else if (hosting && !this.held && age > BbRoomLink.TAKE_AFTER_MS && !this.asked.has(-1 - sequence)) { this.asked.add(-1 - sequence); this.claim(sequence + "/s", { k: "take" }); }
  }

  private claim(path: string, value: object): void {
    this.log.child(path).transaction((current) => (current !== null && current !== undefined ? undefined : value)).catch(() => undefined);
  }

  private static pitchOf(pitch: BbNetPitch): BbPitchId { return BbPitchCatalog.ALL.some((kind) => kind.id === pitch.t) ? pitch.t : "ft"; }

  private static aimOf(pitch: BbNetPitch): BbZonePoint {
    const reach = BbRoomLink.AIM_REACH, safe = (value: number) => (Number.isFinite(value) ? BbCurve.clamp(value, -reach, reach) : 0);
    return { u: safe(pitch.u), v: safe(pitch.v) };
  }

  private static offsetOf(swing: BbNetSwing): number | null {
    return swing.k === "swing" && typeof swing.o === "number" && Number.isFinite(swing.o) ? BbCurve.clamp(swing.o, -1, 1) : null;
  }
}

class BbPresenceWatch {
  private readonly present = new Set<string>();
  private readonly players: FirebaseRef;
  private readonly onJoin = (snapshot: FirebaseSnapshot): void => { this.present.add(snapshot.key); };
  private readonly onLeave = (snapshot: FirebaseSnapshot): void => { this.present.delete(snapshot.key); };

  constructor(session: RkSession<BbPlayerRecord>) {
    this.players = session.ref.child("players");
    this.players.on("child_added", this.onJoin);
    this.players.on("child_removed", this.onLeave);
  }

  close(): void {
    this.players.off("child_added", this.onJoin);
    this.players.off("child_removed", this.onLeave);
  }

  missing(match: BbRoomMatch): string | null {
    const ids = [match.seats.s0, match.seats.s1];
    return ids.find((id) => id !== BbRoomRules.AI_SEAT && !this.present.has(id)) || null;
  }
}

class BbPauseBanner {
  private static readonly WAIT_SECONDS = 45;
  private static readonly RESUME_SECONDS = 3;
  private readonly element: HTMLElement;
  private waited = 0;
  private resumeIn = 0;
  private shown = "";

  constructor(host: HTMLElement) { this.element = BbHudParts.box("bb-pause", host); }

  get paused(): boolean { return this.waited > 0 || this.resumeIn > 0; }

  clear(): void {
    this.waited = 0;
    this.resumeIn = 0;
    this.write("");
  }

  step(frameSeconds: number, someoneMissing: boolean): boolean {
    if (someoneMissing) {
      this.waited += frameSeconds;
      this.resumeIn = BbPauseBanner.RESUME_SECONDS;
      this.write("상대 재접속 대기 중 · " + Math.max(0, Math.ceil(BbPauseBanner.WAIT_SECONDS - this.waited)) + "초");
      return this.waited >= BbPauseBanner.WAIT_SECONDS;
    }
    if (this.waited <= 0) return false;
    this.resumeIn -= frameSeconds;
    if (this.resumeIn > 0) { this.write("다시 시작 " + Math.ceil(this.resumeIn)); return false; }
    this.clear();
    return false;
  }

  private write(text: string): void {
    if (text === this.shown) return;
    this.shown = text;
    this.element.textContent = text;
    this.element.classList.toggle("open", !!text);
  }
}
