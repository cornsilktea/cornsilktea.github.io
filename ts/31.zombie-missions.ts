type ZombieMissionGame = "mash" | "center" | "ring";

interface ZombieRoomSpec {
  type: string;
  bayA: number;
  bayB: number;
  label: string;
}

interface ZombieMissionSite {
  floor: number;
  x: number;
  z: number;
  type: string;
  label: string;
}

interface ZombieMissionKind {
  title: string;
  accepts: (site: ZombieMissionSite) => boolean;
}

interface ZombieMissionPick {
  p: number;
  s: number;
  g: ZombieMissionGame;
}

interface ZombieMission {
  title: string;
  site: ZombieMissionSite;
  game: ZombieMissionGame;
}

class ZombieMissionRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(count: number): number {
    return Math.floor(this.next() * count);
  }
}

class ZombieMissionSites {
  static readonly STAND_FROM_WALL = 0.3;
  static readonly REACH = 2.6;

  static build(floors: ReadonlyArray<{ N: ReadonlyArray<ReadonlyArray<string | number>>; S: ReadonlyArray<ReadonlyArray<string | number>> }>, buildingX: number, bayW: number, corridorZ: number, buildingZ: number): ZombieMissionSite[] {
    const sites: ZombieMissionSite[] = [];
    floors.forEach((plan, floor) => {
      (["N", "S"] as const).forEach((side) => {
        plan[side].forEach((spec) => {
          const type = String(spec[0]);
          if (type === "lobby" || type === "stairs") return;
          const x0 = -buildingX + bayW * Number(spec[1]);
          const dir = side === "N" ? 1 : -1;
          const zMid = dir * (corridorZ + buildingZ - 0.2) / 2;
          sites.push({ floor, x: x0 + ZombieMissionSites.STAND_FROM_WALL, z: zMid, type, label: String(spec[3] || "") });
        });
      });
    });
    return sites;
  }

  static within(site: ZombieMissionSite, x: number, z: number, reach: number = ZombieMissionSites.REACH): boolean {
    return Math.hypot(site.x - x, site.z - z) <= reach;
  }
}

class ZombieMissionCatalog {
  static readonly KINDS: ReadonlyArray<ZombieMissionKind> = [
    { title: "약 챙기기", accepts: (site) => site.type === "nurse" },
    { title: "책 찾기", accepts: (site) => site.type === "library" },
    { title: "서류 챙기기", accepts: (site) => site.type === "staff" },
    { title: "열쇠 찾기", accepts: (site) => site.type === "class" && site.label.indexOf("1학년") === 0 },
    { title: "칠판 암호 풀기", accepts: (site) => site.type === "class" && site.label.indexOf("2학년") === 0 },
    { title: "시험지 회수하기", accepts: (site) => site.type === "class" && site.label.indexOf("3학년") === 0 },
    { title: "실험 도구 챙기기", accepts: (site) => site.type === "science" },
    { title: "악보 찾기", accepts: (site) => site.type === "music" },
    { title: "물감 챙기기", accepts: (site) => site.type === "art" },
    { title: "컴퓨터 켜기", accepts: (site) => site.type === "computer" }
  ];
  static readonly GAMES: ReadonlyArray<ZombieMissionGame> = ["mash", "center", "ring"];
  static readonly GAME_LABELS: Readonly<Record<ZombieMissionGame, string>> = { mash: "연타", center: "가운데 맞추기", ring: "줄어드는 원" };
  static readonly FLOOR_ORDER: ReadonlyArray<number> = [1, 0, 1];
  static readonly COUNT = ZombieMissionCatalog.FLOOR_ORDER.length;
  static readonly SUCCESSES_NEEDED = 2;

  static pick(seed: number, sites: readonly ZombieMissionSite[]): ZombieMissionPick[] {
    const rng = new ZombieMissionRng(seed);
    const usable = ZombieMissionCatalog.KINDS.map((kind, index) => index);
    const picks: ZombieMissionPick[] = [];
    ZombieMissionCatalog.FLOOR_ORDER.forEach((floor) => {
      const sitesOf = (kindIndex: number): number[] => sites.map((site, index) => index).filter((index) => sites[index].floor === floor && ZombieMissionCatalog.KINDS[kindIndex].accepts(sites[index]));
      const onFloor = usable.filter((kindIndex) => sitesOf(kindIndex).length > 0);
      if (!onFloor.length) return;
      const p = onFloor[rng.int(onFloor.length)];
      usable.splice(usable.indexOf(p), 1);
      const matching = sitesOf(p);
      picks.push({ p, s: matching[rng.int(matching.length)], g: ZombieMissionCatalog.GAMES[rng.int(ZombieMissionCatalog.GAMES.length)] });
    });
    return picks;
  }

  static decode(raw: unknown, sites: readonly ZombieMissionSite[]): ZombieMission[] {
    const list = raw && typeof raw === "object" ? Object.keys(raw as object).map((key) => (raw as Record<string, unknown>)[key]) : [];
    const missions: ZombieMission[] = [];
    list.forEach((item) => {
      const pick = item as Partial<ZombieMissionPick> | null;
      if (!pick || !ZombieMissionCatalog.KINDS[Number(pick.p)] || !sites[Number(pick.s)] || ZombieMissionCatalog.GAMES.indexOf(pick.g as ZombieMissionGame) < 0) return;
      missions.push({ title: ZombieMissionCatalog.KINDS[Number(pick.p)].title, site: sites[Number(pick.s)], game: pick.g as ZombieMissionGame });
    });
    return missions;
  }
}

class ZombieMissionProgress {
  static clear(done: number): string {
    return "미션 " + done + "개 클리어";
  }

  static allClear(): string {
    return "미션 모두 완료!";
  }

  static current(missions: readonly ZombieMission[], done: number): ZombieMission | null {
    return done < missions.length ? missions[done] : null;
  }

  static complete(missions: readonly ZombieMission[], done: number): boolean {
    return missions.length > 0 && done >= missions.length;
  }

  // 3분을 버텨도 미션을 다 못 끝냈으면 좀비 승리, 미션을 다 끝내고 한 명이라도 살아 있어야 인간 승리.
  static humansWin(survivors: number, missions: readonly ZombieMission[], done: number): boolean {
    return survivors > 0 && (missions.length === 0 || ZombieMissionProgress.complete(missions, done));
  }
}

interface ZombieMissionView {
  kind: ZombieMissionGame;
  successes: number;
  needed: number;
  progress: number;
  needle: number;
  green: number;
  ring: number;
  ringTarget: number;
  ringTolerance: number;
  state: FrMiniState;
  waiting: boolean;
}

class ZombieMissionRun {
  static readonly RETRY_DELAY = 0.5;
  private game: FrMiniGame;
  private successes = 0;
  private retryIn = 0;
  private finished = false;

  constructor(readonly kind: ZombieMissionGame, readonly needed: number = ZombieMissionCatalog.SUCCESSES_NEEDED) {
    this.game = ZombieMissionRun.make(kind);
  }

  private static make(kind: ZombieMissionGame): FrMiniGame {
    if (kind === "mash") return new FrMashGauge(10);
    if (kind === "center") return new FrCenterStop(0.3, 1);
    return new FrShrinkRing(0.14);
  }

  get done(): boolean {
    return this.finished;
  }

  press(): void {
    if (this.finished || this.retryIn > 0) return;
    this.game.press();
    this.settle();
  }

  tick(dt: number): void {
    if (this.finished) return;
    if (this.retryIn > 0) {
      this.retryIn -= dt;
      if (this.retryIn <= 0) this.game = ZombieMissionRun.make(this.kind);
      return;
    }
    this.game.tick(dt);
    this.settle();
  }

  view(): ZombieMissionView {
    const game = this.game;
    return {
      kind: this.kind, successes: this.successes, needed: this.needed, progress: game.progress(), state: game.state, waiting: game.state === "waiting",
      needle: game instanceof FrCenterStop ? game.needle() : 0, green: game instanceof FrCenterStop ? game.greenFraction : 0,
      ring: game instanceof FrShrinkRing ? game.radius() : 1, ringTarget: game instanceof FrShrinkRing ? game.targetRadius : 0.35, ringTolerance: game instanceof FrShrinkRing ? game.tolerance : 0
    };
  }

  private settle(): void {
    if (this.game.state === "success") {
      this.successes++;
      if (this.successes >= this.needed) { this.finished = true; return; }
      this.game = ZombieMissionRun.make(this.kind);
    } else if (this.game.state === "fail") {
      this.retryIn = ZombieMissionRun.RETRY_DELAY;
    }
  }
}

// 위쪽 가운데 안내 글씨를 하나씩 차례로 보여 준다. 먼저 나온 글씨의 시간이 끝난 뒤에 다음 글씨가 나오고, 시간이 없는 글씨(카운트다운 숫자)는 바로 바꾼다.
class ZombieTopMessages {
  private queue: Array<{ text: string; small: string; ms: number; red: boolean }> = [];
  private busyUntil = 0;
  private timer = 0;

  constructor(private readonly render: (text: string, small: string, red: boolean) => void, private readonly now: () => number) {}

  post(text: string, small: string, ms: number, red: boolean): void {
    if (!text) { this.clear(); return; }
    if (!ms) { this.queue = []; window.clearTimeout(this.timer); this.busyUntil = 0; this.render(text, small, red); return; }
    if (this.now() < this.busyUntil) { this.queue.push({ text, small, ms, red }); return; }
    this.show({ text, small, ms, red });
  }

  clear(): void {
    this.queue = [];
    this.busyUntil = 0;
    window.clearTimeout(this.timer);
    this.render("", "", false);
  }

  private show(item: { text: string; small: string; ms: number; red: boolean }): void {
    this.render(item.text, item.small, item.red);
    this.busyUntil = this.now() + item.ms;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.next(), item.ms);
  }

  private next(): void {
    const item = this.queue.shift();
    if (item) { this.show(item); return; }
    this.busyUntil = 0;
    this.render("", "", false);
  }
}
