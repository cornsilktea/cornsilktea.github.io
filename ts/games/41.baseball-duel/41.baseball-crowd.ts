type BbFanMood = "sit" | "clap" | "cheer" | "jump" | "groan";

interface BbFanSpec {
  x: number;
  y: number;
  z: number;
  yaw: number;
  angle: number;
  team: -1 | 0 | 1;
  delay: number;
  pace: number;
  phase: number;
  strength: number;
  lazy: boolean;
  sways: boolean;
  style: number;
  sector: number;
}

interface BbFanPose {
  lift: number;
  hop: number;
  armLeft: number;
  armRight: number;
  spread: number;
  bow: number;
}

class BbCrowdMoodBoard {
  private static readonly LASTS = 3.4;
  private static readonly WAVE_LASTS = 6;
  private readonly moods: Array<{ mood: BbFanMood; since: number }> = [{ mood: "sit", since: 0 }, { mood: "sit", since: 0 }, { mood: "sit", since: 0 }];
  private waveSince = -100;
  tense = false;

  set(team: -1 | 0 | 1, mood: BbFanMood, now: number): void { this.moods[team + 1] = { mood, since: now }; }

  wave(now: number): void { this.waveSince = now; }

  of(team: -1 | 0 | 1, now: number): { mood: BbFanMood; since: number } {
    const entry = this.moods[team + 1];
    return now - entry.since > BbCrowdMoodBoard.LASTS ? { mood: this.tense ? "clap" : "sit", since: entry.since + BbCrowdMoodBoard.LASTS } : entry;
  }

  waveAt(now: number): number { return now - this.waveSince < BbCrowdMoodBoard.WAVE_LASTS ? now - this.waveSince : -1; }

  busy(now: number): boolean { return this.tense || this.waveAt(now) >= 0 || this.moods.some((entry) => now - entry.since <= BbCrowdMoodBoard.LASTS + 0.7); }
}

class BbFanPoser {
  private static readonly WAVE_SPEED = 2.2;
  private static readonly WAVE_HOLD = 0.9;

  static pose(fan: BbFanSpec, mood: BbFanMood, since: number, now: number, waveAge: number, tense: boolean, out: BbFanPose): BbFanPose {
    const local = Math.max(0, (now - since - fan.delay) * fan.pace), wake = BbCurve.clamp(local * 4, 0, 1) * (fan.lazy ? 0.45 : 1) * fan.strength;
    out.lift = 0; out.hop = 0; out.armLeft = 0; out.armRight = 0; out.spread = 0; out.bow = 0;
    const effective: BbFanMood = mood === "clap" && tense && fan.phase > Math.PI ? "sit" : mood;
    if (effective === "sit") {
      if (fan.sways) out.bow = Math.sin(now * 1.3 * fan.pace + fan.phase) * 0.06;
    } else if (effective === "clap") {
      out.lift = 0.26 * wake;
      out.armLeft = out.armRight = 1.25 * wake;
      out.spread = (0.28 + Math.sin(now * 9 * fan.pace + fan.phase) * 0.26) * wake;
    } else if (effective === "groan") {
      out.bow = 0.4 * wake;
      out.armLeft = out.armRight = 0.5 * wake;
      out.spread = -0.25 * wake;
    } else {
      const raise = 2.7 * wake, shake = Math.sin(now * 10 * fan.pace + fan.phase) * 0.35 * wake;
      out.lift = 0.3 * wake;
      if (fan.style === 0) { out.armLeft = out.armRight = raise; out.spread = 0.25 * wake; }
      else if (fan.style === 1) { out.armLeft = raise + shake; out.armRight = raise - shake; out.spread = 0.4 * wake; }
      else if (fan.style === 2) { out.armLeft = 0.6 * wake; out.armRight = raise + Math.abs(shake) * 0.8; }
      else { out.armLeft = out.armRight = raise; out.spread = (0.1 + Math.abs(shake) * 0.6) * wake; }
      if (effective === "jump") out.hop = Math.abs(Math.sin(local * 7)) * 0.32 * wake;
    }
    if (waveAge >= 0) {
      const front = waveAge * BbFanPoser.WAVE_SPEED - fan.angle, rise = front >= 0 && front < BbFanPoser.WAVE_HOLD ? Math.sin(Math.PI * front / BbFanPoser.WAVE_HOLD) : 0;
      if (rise > 0) { out.lift = Math.max(out.lift, 0.32 * rise); out.armLeft = Math.max(out.armLeft, 2.9 * rise); out.armRight = Math.max(out.armRight, 2.9 * rise); }
    }
    return out;
  }
}

class BbCrowdSystem {
  private static readonly SECTORS = 14;
  private static readonly SHOULDER = 0.27;
  private static readonly ARM_LENGTH = 0.42;
  private static readonly FLAG_SHARE = 0.12;
  private static readonly SHIRT_COLORS: readonly string[] = ["#e9e6dc", "#d9534f", "#3b6fb6", "#f0c040", "#4caf7a", "#8e6bbf", "#f08a3e", "#2f3640", "#e8a0b8", "#7fb6d9"];
  private static readonly SKIN_COLORS: readonly string[] = ["#FFE0C8", "#F6C09C", "#E2A981", "#C98A62", "#A86A48"];

  readonly group: Three<"Group">;
  private readonly fans: BbFanSpec[] = [];
  private readonly torsos: Three<"InstancedMesh">;
  private readonly heads: Three<"InstancedMesh">;
  private readonly arms: Three<"InstancedMesh">;
  private readonly flags: Three<"InstancedMesh">;
  private readonly flagOf: number[] = [];
  private readonly sectorCenters: Three<"Sphere">[] = [];
  private readonly sectorStale: boolean[] = [];
  private readonly board = new BbCrowdMoodBoard();
  private readonly pose: BbFanPose = { lift: 0, hop: 0, armLeft: 0, armRight: 0, spread: 0, bow: 0 };
  private readonly matrix: Three<"Matrix4">;
  private readonly hidden: Three<"Matrix4">;
  private readonly spot: Three<"Vector3">;
  private readonly turn: Three<"Quaternion">;
  private readonly tilt: Three<"Euler">;
  private readonly unit: Three<"Vector3">;
  private readonly frustum: Three<"Frustum">;
  private readonly viewMatrix: Three<"Matrix4">;
  private now = 0;
  private sinceUpdate = 0;
  private interval = 1 / 20;
  private shown: number;
  private settled = false;

  constructor(private readonly libs: ThreeLibs, seats: readonly number[]) {
    const THREE = libs.THREE, random = new BbNoise(20261114), roll = () => (random.next() + 1) / 2;
    const order = Array.from({ length: seats.length / 3 }, (_, index) => index);
    for (let index = order.length - 1; index > 0; index--) { const swap = Math.floor(roll() * (index + 1)); [order[index], order[swap]] = [order[swap], order[index]]; }
    order.forEach((seat) => {
      const x = seats[seat * 3], y = seats[seat * 3 + 1], z = -seats[seat * 3 + 2], angle = Math.atan2(x, -z);
      const team: -1 | 0 | 1 = x > 12 ? 1 : x < -12 ? 0 : -1;
      this.fans.push({
        x, y, z, yaw: Math.atan2(-x, -z), angle: angle + Math.PI / 2, team, delay: roll() * 0.6, pace: 0.85 + roll() * 0.3, phase: roll() * Math.PI * 2, strength: 0.6 + roll() * 0.4,
        lazy: roll() < 0.2, sways: roll() < 0.3, style: Math.floor(roll() * 4), sector: Math.min(BbCrowdSystem.SECTORS - 1, Math.max(0, Math.floor((angle + Math.PI) / (2 * Math.PI) * BbCrowdSystem.SECTORS)))
      });
    });
    const total = this.fans.length, color = new THREE.Color();
    this.torsos = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.52, 0.3), new THREE.MeshLambertMaterial(), total);
    this.heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 0), new THREE.MeshLambertMaterial(), total);
    const armShape = new THREE.BoxGeometry(0.11, BbCrowdSystem.ARM_LENGTH, 0.11);
    armShape.translate(0, -BbCrowdSystem.ARM_LENGTH / 2, 0);
    this.arms = new THREE.InstancedMesh(armShape, new THREE.MeshLambertMaterial(), total * 2);
    this.fans.forEach((fan, index) => {
      const shirt = BbCrowdSystem.SHIRT_COLORS[Math.floor(roll() * BbCrowdSystem.SHIRT_COLORS.length)], skin = BbCrowdSystem.SKIN_COLORS[Math.floor(roll() * BbCrowdSystem.SKIN_COLORS.length)];
      this.torsos.setColorAt(index, color.set(shirt));
      this.heads.setColorAt(index, color.set(skin));
      this.arms.setColorAt(index * 2, color.set(shirt));
      this.arms.setColorAt(index * 2 + 1, color.set(shirt));
      if (roll() < BbCrowdSystem.FLAG_SHARE && fan.team !== -1) this.flagOf.push(index);
    });
    const flagShape = new THREE.PlaneGeometry(0.55, 0.36);
    flagShape.translate(0.3, 0, 0);
    this.flags = new THREE.InstancedMesh(flagShape, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), Math.max(1, this.flagOf.length));
    this.flagOf.forEach((fan, index) => this.flags.setColorAt(index, color.set(this.fans[fan].team === 1 ? BbTeamKits.HOME.cap : BbTeamKits.AWAY.cap)));
    this.matrix = new THREE.Matrix4();
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this.spot = new THREE.Vector3();
    this.turn = new THREE.Quaternion();
    this.tilt = new THREE.Euler(0, 0, 0, "YXZ");
    this.unit = new THREE.Vector3(1, 1, 1);
    this.frustum = new THREE.Frustum();
    this.viewMatrix = new THREE.Matrix4();
    this.buildSectors();
    this.group = new THREE.Group();
    this.group.add(this.torsos, this.heads, this.arms, this.flags);
    [this.torsos, this.heads, this.arms, this.flags].forEach((mesh) => { mesh.frustumCulled = false; });
    this.shown = total;
    this.writeAll();
  }

  get size(): number { return this.fans.length; }

  react(moment: BbCrowdMoment, batting: 0 | 1): void {
    const fielding: 0 | 1 = batting === 0 ? 1 : 0, now = this.now;
    if (moment === "homer") { [-1, 0, 1].forEach((team) => this.board.set(team as -1 | 0 | 1, team === fielding ? "clap" : "jump", now)); this.board.wave(now); }
    else if (moment === "run") { this.board.set(batting, "jump", now); this.board.set(-1, "cheer", now); this.board.set(fielding, "groan", now); }
    else if (moment === "hit") { this.board.set(batting, "cheer", now); this.board.set(-1, "clap", now); this.board.set(fielding, "groan", now); }
    else { this.board.set(fielding, "cheer", now); this.board.set(batting, "groan", now); this.board.set(-1, "clap", now); }
    this.settled = false;
  }

  tension(on: boolean): void {
    if (this.board.tense === on) return;
    this.board.tense = on;
    this.settled = false;
  }

  slower(): boolean {
    if (this.interval >= 1 / 8) return false;
    this.interval = this.interval < 1 / 12 ? 1 / 12 : 1 / 8;
    return true;
  }

  thinner(): boolean {
    if (this.shown <= this.fans.length / 3) return false;
    this.shown = Math.floor(this.shown * 0.6);
    [this.torsos, this.heads].forEach((mesh) => { mesh.count = this.shown; });
    this.arms.count = this.shown * 2;
    return true;
  }

  update(frameSeconds: number, camera: Three<"PerspectiveCamera">): void {
    this.now += frameSeconds;
    this.sinceUpdate += frameSeconds;
    if (this.sinceUpdate < this.interval) return;
    this.sinceUpdate = 0;
    const busy = this.board.busy(this.now);
    if (!busy && this.settled) { this.swayVisible(camera); return; }
    this.settled = !busy;
    this.viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewMatrix);
    const visible = this.sectorCenters.map((sphere, sector) => { const seen = this.frustum.intersectsSphere(sphere); if (!seen) this.sectorStale[sector] = true; return seen; });
    for (let index = 0; index < this.shown; index++) if (visible[this.fans[index].sector]) this.place(index);
    visible.forEach((seen, sector) => { if (seen) this.sectorStale[sector] = false; });
    this.placeFlags(visible);
    this.flush();
  }

  private swayVisible(camera: Three<"PerspectiveCamera">): void {
    this.viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewMatrix);
    const visible = this.sectorCenters.map((sphere) => this.frustum.intersectsSphere(sphere));
    let moved = false;
    for (let index = 0; index < this.shown; index++) {
      const fan = this.fans[index];
      if (!visible[fan.sector] || (!fan.sways && !this.sectorStale[fan.sector])) continue;
      this.place(index);
      moved = true;
    }
    visible.forEach((seen, sector) => { if (seen) this.sectorStale[sector] = false; });
    if (moved) this.flush();
  }

  private buildSectors(): void {
    const THREE = this.libs.THREE;
    for (let sector = 0; sector < BbCrowdSystem.SECTORS; sector++) {
      const members = this.fans.filter((fan) => fan.sector === sector), center = new THREE.Vector3();
      members.forEach((fan) => center.add(this.spot.set(fan.x, fan.y, fan.z)));
      if (members.length) center.multiplyScalar(1 / members.length);
      let radius = 1;
      members.forEach((fan) => { radius = Math.max(radius, center.distanceTo(this.spot.set(fan.x, fan.y, fan.z)) + 1.5); });
      this.sectorCenters.push(new THREE.Sphere(center, radius));
      this.sectorStale.push(false);
    }
  }

  private writeAll(): void {
    for (let index = 0; index < this.fans.length; index++) this.place(index);
    this.placeFlags(this.sectorCenters.map(() => true));
    this.flush();
  }

  private place(index: number): void {
    const fan = this.fans[index], entry = this.board.of(fan.team, this.now);
    const pose = BbFanPoser.pose(fan, entry.mood, entry.since, this.now, this.board.waveAt(this.now), this.board.tense, this.pose);
    const base = fan.y + 0.36 + pose.lift + pose.hop, cos = Math.cos(fan.yaw), sin = Math.sin(fan.yaw);
    this.tilt.set(pose.bow, fan.yaw, 0);
    this.turn.setFromEuler(this.tilt);
    this.torsos.setMatrixAt(index, this.matrix.compose(this.spot.set(fan.x, base, fan.z), this.turn, this.unit));
    this.heads.setMatrixAt(index, this.matrix.compose(this.spot.set(fan.x + sin * pose.bow * 0.35, base + 0.44 - pose.bow * 0.12, fan.z + cos * pose.bow * 0.35), this.turn, this.unit));
    [-1, 1].forEach((side, arm) => {
      const raise = arm === 0 ? pose.armLeft : pose.armRight;
      this.tilt.set(-raise, fan.yaw, side * (0.08 + pose.spread * (raise > 1.6 ? 1 : -0.6)));
      this.turn.setFromEuler(this.tilt);
      this.arms.setMatrixAt(index * 2 + arm, this.matrix.compose(this.spot.set(fan.x + cos * side * BbCrowdSystem.SHOULDER, base + 0.2, fan.z - sin * side * BbCrowdSystem.SHOULDER), this.turn, this.unit));
    });
  }

  private placeFlags(visible: readonly boolean[]): void {
    const hidden = this.hidden;
    this.flagOf.forEach((fanIndex, index) => {
      const fan = this.fans[fanIndex];
      if (!visible[fan.sector]) return;
      const entry = this.board.of(fan.team, this.now), waving = fanIndex < this.shown && (entry.mood === "cheer" || entry.mood === "jump");
      if (!waving) { this.flags.setMatrixAt(index, hidden); return; }
      const cos = Math.cos(fan.yaw), sin = Math.sin(fan.yaw), lift = fan.y + 0.36 + 0.3 + 0.2 + BbCrowdSystem.ARM_LENGTH + 0.1;
      this.tilt.set(0, fan.yaw + Math.sin(this.now * 8 + fan.phase) * 0.6, 0);
      this.turn.setFromEuler(this.tilt);
      this.flags.setMatrixAt(index, this.matrix.compose(this.spot.set(fan.x + cos * BbCrowdSystem.SHOULDER, lift, fan.z - sin * BbCrowdSystem.SHOULDER), this.turn, this.unit));
    });
  }

  private flush(): void {
    [this.torsos, this.heads, this.arms, this.flags].forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  }
}
