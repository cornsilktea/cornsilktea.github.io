interface FrTransactionResult<T> { committed: boolean; value: T | null }

interface FrBackend {
  get<T>(path: string): Promise<T | null>;
  set(path: string, value: unknown): Promise<void>;
  patch(path: string, value: Record<string, unknown>): Promise<void>;
  transaction<T>(path: string, update: (current: T | null) => T | null | undefined): Promise<FrTransactionResult<T>>;
  lastChildren<T>(path: string, count: number): Promise<Array<[string, T]>>;
  serverTime(probePath: string): Promise<number>;
}

class FrRestBackend implements FrBackend {
  private static readonly RETRIES = 6;

  constructor(private readonly user: PortalUser) {}

  async get<T>(path: string): Promise<T | null> {
    const response = await fetch(await this.url(path), { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json()) as T | null;
  }

  async set(path: string, value: unknown): Promise<void> {
    await this.send("PUT", await this.url(path, "&print=silent"), value);
  }

  async patch(path: string, value: Record<string, unknown>): Promise<void> {
    await this.send("PATCH", await this.url(path, "&print=silent"), value);
  }

  async transaction<T>(path: string, update: (current: T | null) => T | null | undefined): Promise<FrTransactionResult<T>> {
    for (let attempt = 0; attempt < FrRestBackend.RETRIES; attempt++) {
      const address = await this.url(path);
      const read = await fetch(address, { cache: "no-store", headers: { "X-Firebase-ETag": "true" } });
      if (!read.ok) throw new Error(String(read.status));
      const etag = read.headers.get("ETag") || "";
      const current = (await read.json()) as T | null;
      const next = update(current);
      if (next === undefined) return { committed: false, value: current };
      const write = await fetch(address, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "if-match": etag },
        body: JSON.stringify(next),
      });
      if (write.status === 412) continue;
      if (!write.ok) throw new Error(String(write.status));
      return { committed: true, value: next };
    }
    throw new Error("transaction-busy");
  }

  async lastChildren<T>(path: string, count: number): Promise<Array<[string, T]>> {
    const query = "&orderBy=" + encodeURIComponent('"$key"') + "&limitToLast=" + count;
    const response = await fetch(await this.url(path, query), { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as Record<string, T> | null;
    return data ? Object.keys(data).sort().map((key) => [key, data[key]] as [string, T]) : [];
  }

  async serverTime(probePath: string): Promise<number> {
    await this.send("PUT", await this.url(probePath, "&print=silent"), { ".sv": "timestamp" });
    const value = await this.get<number>(probePath);
    return typeof value === "number" ? value : Date.now();
  }

  private async send(method: string, url: string, value: unknown): Promise<void> {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    if (!response.ok) throw new Error(String(response.status));
  }

  private async url(path: string, extra = ""): Promise<string> {
    const config = window.PORTAL_CONFIG;
    if (!config || !config.isReady()) throw new Error("no-db");
    const token = await this.user.getToken();
    return config.DB_URL.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "") + ".json?auth=" + encodeURIComponent(token) + extra;
  }
}

class FrLocalBackend implements FrBackend {
  private static readonly STORAGE_KEY = "forest_local_v1";
  private tree: Record<string, unknown>;

  constructor(private readonly persistent = true) {
    this.tree = persistent ? this.restore() : {};
  }

  async get<T>(path: string): Promise<T | null> {
    return this.clone(this.read(path)) as T | null;
  }

  async set(path: string, value: unknown): Promise<void> {
    this.write(path, this.clone(value));
    this.persist();
  }

  async patch(path: string, value: Record<string, unknown>): Promise<void> {
    Object.keys(value).forEach((key) => this.write(path + "/" + key, this.clone(value[key])));
    this.persist();
  }

  async transaction<T>(path: string, update: (current: T | null) => T | null | undefined): Promise<FrTransactionResult<T>> {
    const current = this.clone(this.read(path)) as T | null;
    const next = update(current);
    if (next === undefined) return { committed: false, value: current };
    this.write(path, this.clone(next));
    this.persist();
    return { committed: true, value: next };
  }

  async lastChildren<T>(path: string, count: number): Promise<Array<[string, T]>> {
    const data = this.read(path) as Record<string, T> | null;
    if (!data) return [];
    return Object.keys(data).sort().slice(-count).map((key) => [key, this.clone(data[key]) as T] as [string, T]);
  }

  async serverTime(): Promise<number> { return Date.now(); }

  private parts(path: string): string[] { return path.split("/").filter((p) => p.length > 0); }

  private read(path: string): unknown {
    let node: unknown = this.tree;
    for (const part of this.parts(path)) {
      if (node === null || typeof node !== "object") return null;
      node = (node as Record<string, unknown>)[part];
    }
    return node === undefined ? null : node;
  }

  private write(path: string, value: unknown): void {
    const parts = this.parts(path);
    let node = this.tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = node[parts[i]];
      if (next === null || typeof next !== "object") node[parts[i]] = {};
      node = node[parts[i]] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last]; else node[last] = value;
  }

  private clone(value: unknown): unknown { return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value)); }

  private restore(): Record<string, unknown> {
    try {
      const stored = localStorage.getItem(FrLocalBackend.STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Record<string, unknown>) : {};
    } catch (error) {
      return {};
    }
  }

  private persist(): void {
    if (!this.persistent) return;
    try { localStorage.setItem(FrLocalBackend.STORAGE_KEY, JSON.stringify(this.tree)); } catch (error) { return; }
  }
}

class FrIdentity {
  static readonly LOGIN_LINK_PATTERN = /[?&]c=(?:[1-3]-[1-5]|contest|test)(?:&|$)/;
  static readonly USER_EVENT = "portal-user-changed";
  static readonly WAIT_MS = 25000;

  static user(): PortalUser | null { return window.PORTAL_USER || window.PORTAL_GUEST || null; }

  static required(search: string): boolean { return FrIdentity.LOGIN_LINK_PATTERN.test(search); }

  static async ready(search: string): Promise<PortalUser | null> {
    if (FrIdentity.user() || !FrIdentity.required(search)) return FrIdentity.user();
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, FrIdentity.WAIT_MS);
      document.addEventListener(FrIdentity.USER_EVENT, () => { window.clearTimeout(timer); resolve(); }, { once: true });
    });
    return FrIdentity.user();
  }
}

class FrBackendChooser {
  static choose(): FrBackend {
    const user = FrIdentity.user();
    return user ? new FrRestBackend(user) : new FrLocalBackend();
  }
}
