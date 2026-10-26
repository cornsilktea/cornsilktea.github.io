/* =====================================================================
   계정별 개인 기록 (공용 모듈, 로그인한 학생만)

   저장 위치(Realtime Database, 본인만 읽고 쓴다 — 데이터베이스규칙.json 의 users):
     users/<uid>/profile                     { name, email, at }
     users/<uid>/best/<게임>/<key>           { score, lower, at }  게임별 개인 최고 기록 (더 좋을 때만 덮어씀)
     users/<uid>/localBests/<기기 저장 키>    { raw, at }  이 기기에 있던 localStorage 최고 기록을 처음 로그인할 때 한 번 옮겨 둔 것

   사용법(로그인 상태인 학생 기기에서만 의미가 있다)
     const best = new PersonalBest("snakegame");                  // 작을수록 좋은 기록이면 { lower: true }, 곡·코스별이면 { key: "곡아이디" }
     best.report(점수).then((갱신됨) => …);                        // 로그인 전이면 false
     best.load().then((기록 | null) => …);

   이 파일은 account-login.js 가 로그인에 성공하면 불러온다. 따로 script 로 넣는 자료는 로그인한 반별 링크에서만 쓴다.
   과제 제출·RPG 성장도 users/<uid>/ 아래 가지를 늘려 같은 AccountDatabase 로 읽고 쓰면 된다.
   ===================================================================== */

interface PersonalBestRow {
  score: number;
  lower: boolean;
  at: number;
}

interface PersonalBestOptions {
  lower?: boolean;
  key?: string;
}

interface LocalBestRow {
  raw: string;
  at: unknown;
}

class AccountDatabase {
  constructor(private readonly user: PortalUser) {}

  async read<T>(path: string): Promise<T | null> {
    const response = await fetch(await this.address(path), { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json()) as T | null;
  }

  async write(path: string, value: unknown): Promise<void> {
    const response = await fetch(await this.address(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
    if (!response.ok) throw new Error(String(response.status));
  }

  private async address(path: string): Promise<string> {
    const config = window.PORTAL_CONFIG;
    if (!config || !config.isReady()) throw new Error("no-db");
    const token = await this.user.getToken();
    const base = config.DB_URL.replace(/\/+$/, "");
    return base + "/users/" + this.user.uid + "/" + path + ".json?auth=" + encodeURIComponent(token);
  }
}

class PersonalBest {
  private readonly path: string;
  private readonly lower: boolean;
  private row: PersonalBestRow | null = null;
  private loaded = false;

  constructor(game: string, options: PersonalBestOptions = {}) {
    this.path = "best/" + game + "/" + (options.key || "all");
    this.lower = !!options.lower;
  }

  async load(): Promise<PersonalBestRow | null> {
    const user = window.PORTAL_USER;
    if (!user) return null;
    this.row = await new AccountDatabase(user).read<PersonalBestRow>(this.path);
    this.loaded = true;
    return this.row;
  }

  async report(score: number): Promise<boolean> {
    const user = window.PORTAL_USER;
    if (!user || !isFinite(score) || score < 0) return false;
    if (!this.loaded) await this.load();
    if (!this.isBetter(score)) return false;
    await new AccountDatabase(user).write(this.path, { score, lower: this.lower, at: { ".sv": "timestamp" } });
    this.row = { score, lower: this.lower, at: Date.now() };
    return true;
  }

  private isBetter(score: number): boolean {
    if (!this.row) return true;
    return this.lower ? score < this.row.score : score > this.row.score;
  }
}

class LocalBestMigrator {
  private static readonly KEY_PATTERN = /^[a-z0-9]+_best(?:_v[0-9]+)?$/;
  private static readonly MAX_RAW_LENGTH = 2000;
  private static readonly DONE_PREFIX = "account_migrated_";

  constructor(private readonly user: PortalUser, private readonly database: AccountDatabase) {}

  async migrateOnce(): Promise<void> {
    const doneKey = LocalBestMigrator.DONE_PREFIX + this.user.uid;
    if (this.readFlag(doneKey)) return;
    const found = this.collectLocalBests();
    if (found.length > 0) {
      const existing = (await this.database.read<Record<string, LocalBestRow>>("localBests")) || {};
      for (const [key, raw] of found) {
        if (existing[key]) continue;
        await this.database.write("localBests/" + key, { raw, at: { ".sv": "timestamp" } });
      }
    }
    this.writeFlag(doneKey);
  }

  private collectLocalBests(): Array<[string, string]> {
    const found: Array<[string, string]> = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index) || "";
        const raw = localStorage.getItem(key) || "";
        const usable = LocalBestMigrator.KEY_PATTERN.test(key) && raw.length > 0 && raw.length <= LocalBestMigrator.MAX_RAW_LENGTH;
        if (usable) found.push([key, raw]);
      }
    } catch (error) {
      return [];
    }
    return found;
  }

  private readFlag(key: string): boolean {
    try {
      return localStorage.getItem(key) === "1";
    } catch (error) {
      return false;
    }
  }

  private writeFlag(key: string): void {
    try {
      localStorage.setItem(key, "1");
    } catch (error) {
      return;
    }
  }
}

class AccountRecordsStarter {
  start(): void {
    const user = window.PORTAL_USER;
    if (!user) return;
    const database = new AccountDatabase(user);
    const profile = { name: user.name, email: user.email, at: { ".sv": "timestamp" } };
    database.write("profile", profile)
      .then(() => new LocalBestMigrator(user, database).migrateOnce())
      .catch(() => undefined);
  }
}

new AccountRecordsStarter().start();
