class UsageTally {
  downBytes = 0;
  upBytes = 0;
  requests = 0;
  startedAt = Date.now();

  addDown(bytes: number): void { this.downBytes += bytes; }
  addUp(bytes: number): void { this.upBytes += bytes; this.requests++; }

  isEmpty(): boolean { return this.downBytes + this.upBytes === 0; }

  take(): UsageSnapshot {
    const snapshot: UsageSnapshot = {
      down: Math.round(this.downBytes),
      up: Math.round(this.upBytes),
      req: this.requests,
      sec: Math.round((Date.now() - this.startedAt) / 1000)
    };
    this.downBytes = 0;
    this.upBytes = 0;
    this.requests = 0;
    this.startedAt = Date.now();
    return snapshot;
  }
}

interface UsageSnapshot {
  down: number;
  up: number;
  req: number;
  sec: number;
}

class UsageHosts {
  static readonly DATABASE_HOSTS = ["firebaseio.com", "firebasedatabase.app"];
  static readonly OWN_PATH = "usageDaily";

  static isDatabase(address: string): boolean {
    return UsageHosts.DATABASE_HOSTS.some((host) => address.indexOf(host) >= 0);
  }

  static counts(address: string): boolean {
    return UsageHosts.isDatabase(address) && address.indexOf(UsageHosts.OWN_PATH) < 0;
  }

  static addressOf(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }
}

class UsagePayload {
  static size(data: unknown): number {
    if (typeof data === "string") return data.length;
    if (data instanceof ArrayBuffer) return data.byteLength;
    if (data instanceof Blob) return data.size;
    if (ArrayBuffer.isView(data)) return data.byteLength;
    return 0;
  }
}

class UsageFetchTap {
  private readonly nativeFetch: typeof fetch = window.fetch.bind(window);

  constructor(private readonly tally: UsageTally) {}

  install(): void {
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => this.tracked(input, init);
  }

  private tracked(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const address = UsageHosts.addressOf(input);
    if (!UsageHosts.counts(address)) return this.nativeFetch(input, init);
    this.tally.addUp(address.length + UsagePayload.size(init ? init.body : null));
    return this.nativeFetch(input, init).then((response) => this.counted(response));
  }

  private counted(response: Response): Response {
    if (!response.body) return response;
    const tally = this.tally;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        tally.addDown(chunk.byteLength);
        controller.enqueue(chunk);
      }
    });
    return new Response(response.body.pipeThrough(counter), { status: response.status, statusText: response.statusText, headers: response.headers });
  }
}

class UsageSocketTap {
  constructor(private readonly tally: UsageTally) {}

  install(): void {
    const tally = this.tally;
    const NativeSocket = window.WebSocket;
    class CountingSocket extends NativeSocket {
      private readonly counted: boolean;

      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.counted = UsageHosts.counts(String(url));
        if (this.counted) this.addEventListener("message", (event) => tally.addDown(UsagePayload.size(event.data)));
      }

      send(data: string | Blob | BufferSource): void {
        if (this.counted) tally.addUp(UsagePayload.size(data));
        super.send(data);
      }
    }
    window.WebSocket = CountingSocket;
  }
}

class UsageDay {
  static keyOf(date: Date): string {
    return String(date.getFullYear()) + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0");
  }
}

class UsageGameName {
  static readonly MAX_LENGTH = 30;

  static fromPage(): string {
    const tag = document.querySelector("script[data-game]");
    const raw = tag ? tag.getAttribute("data-game") || "" : "";
    return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, UsageGameName.MAX_LENGTH);
  }
}

class UsageReporter {
  constructor(private readonly game: string, private readonly tally: UsageTally) {}

  async send(roundEnded: boolean): Promise<void> {
    const user = window.PORTAL_USER || window.PORTAL_GUEST;
    const config = window.PORTAL_CONFIG;
    if (!this.game || !user || !config || !config.isReady() || this.tally.isEmpty()) return;
    const snapshot = this.tally.take();
    try {
      const token = await user.getToken();
      const address = config.DB_URL.replace(/\/+$/, "") + "/" + UsageHosts.OWN_PATH + "/" + UsageDay.keyOf(new Date()) + "/" + this.game + ".json?auth=" + encodeURIComponent(token) + "&print=silent";
      await fetch(address, { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.increments(snapshot, roundEnded)) });
    } catch (error) {
      return;
    }
  }

  private increments(snapshot: UsageSnapshot, roundEnded: boolean): Record<string, unknown> {
    return {
      down: UsageReporter.add(snapshot.down),
      up: UsageReporter.add(snapshot.up),
      req: UsageReporter.add(snapshot.req),
      sec: UsageReporter.add(Math.min(snapshot.sec, 3600)),
      rounds: UsageReporter.add(roundEnded ? 1 : 0)
    };
  }

  private static add(amount: number): Record<string, unknown> {
    return { ".sv": { increment: amount } };
  }
}

class UsageMeter {
  static readonly ROUND_END_EVENT = "portal-round-end";
  static readonly MIN_GAP_MS = 5000;

  private readonly tally = new UsageTally();
  private readonly reporter = new UsageReporter(UsageGameName.fromPage(), this.tally);
  private lastRoundAt = 0;

  start(): void {
    if (location.protocol === "file:" || !UsageGameName.fromPage()) return;
    new UsageFetchTap(this.tally).install();
    new UsageSocketTap(this.tally).install();
    window.addEventListener(UsageMeter.ROUND_END_EVENT, () => this.roundEnded());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void this.reporter.send(false); });
  }

  private roundEnded(): void {
    const now = Date.now();
    if (now - this.lastRoundAt < UsageMeter.MIN_GAP_MS) return;
    this.lastRoundAt = now;
    void this.reporter.send(true);
  }
}

new UsageMeter().start();
