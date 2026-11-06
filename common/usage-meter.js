"use strict";
class UsageTally {
    constructor() {
        this.downBytes = 0;
        this.upBytes = 0;
        this.requests = 0;
        this.startedAt = Date.now();
    }
    addDown(bytes) { this.downBytes += bytes; }
    addUp(bytes) { this.upBytes += bytes; this.requests++; }
    isEmpty() { return this.downBytes + this.upBytes === 0; }
    take() {
        const snapshot = {
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
class UsageHosts {
    static isDatabase(address) {
        return UsageHosts.DATABASE_HOSTS.some((host) => address.indexOf(host) >= 0);
    }
    static counts(address) {
        return UsageHosts.isDatabase(address) && address.indexOf(UsageHosts.OWN_PATH) < 0;
    }
    static addressOf(input) {
        if (typeof input === "string")
            return input;
        if (input instanceof URL)
            return input.href;
        return input.url;
    }
}
UsageHosts.DATABASE_HOSTS = ["firebaseio.com", "firebasedatabase.app"];
UsageHosts.OWN_PATH = "usageDaily";
class UsagePayload {
    static size(data) {
        if (typeof data === "string")
            return data.length;
        if (data instanceof ArrayBuffer)
            return data.byteLength;
        if (data instanceof Blob)
            return data.size;
        if (ArrayBuffer.isView(data))
            return data.byteLength;
        return 0;
    }
}
class UsageFetchTap {
    constructor(tally) {
        this.tally = tally;
        this.nativeFetch = window.fetch.bind(window);
    }
    install() {
        window.fetch = (input, init) => this.tracked(input, init);
    }
    tracked(input, init) {
        const address = UsageHosts.addressOf(input);
        if (!UsageHosts.counts(address))
            return this.nativeFetch(input, init);
        this.tally.addUp(address.length + UsagePayload.size(init ? init.body : null));
        return this.nativeFetch(input, init).then((response) => this.counted(response));
    }
    counted(response) {
        if (!response.body)
            return response;
        const tally = this.tally;
        const counter = new TransformStream({
            transform(chunk, controller) {
                tally.addDown(chunk.byteLength);
                controller.enqueue(chunk);
            }
        });
        return new Response(response.body.pipeThrough(counter), { status: response.status, statusText: response.statusText, headers: response.headers });
    }
}
class UsageSocketTap {
    constructor(tally) {
        this.tally = tally;
    }
    install() {
        const tally = this.tally;
        const NativeSocket = window.WebSocket;
        class CountingSocket extends NativeSocket {
            constructor(url, protocols) {
                super(url, protocols);
                this.counted = UsageHosts.counts(String(url));
                if (this.counted)
                    this.addEventListener("message", (event) => tally.addDown(UsagePayload.size(event.data)));
            }
            send(data) {
                if (this.counted)
                    tally.addUp(UsagePayload.size(data));
                super.send(data);
            }
        }
        window.WebSocket = CountingSocket;
    }
}
class UsageDay {
    static keyOf(date) {
        return String(date.getFullYear()) + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0");
    }
}
class UsageGameName {
    static fromPage() {
        const tag = document.querySelector("script[data-game]");
        const raw = tag ? tag.getAttribute("data-game") || "" : "";
        return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, UsageGameName.MAX_LENGTH);
    }
}
UsageGameName.MAX_LENGTH = 30;
class UsageReporter {
    constructor(game, tally) {
        this.game = game;
        this.tally = tally;
    }
    async send(roundEnded) {
        const user = window.PORTAL_USER || window.PORTAL_GUEST;
        const config = window.PORTAL_CONFIG;
        if (!this.game || !user || !config || !config.isReady() || this.tally.isEmpty())
            return;
        const snapshot = this.tally.take();
        try {
            const token = await user.getToken();
            const address = config.DB_URL.replace(/\/+$/, "") + "/" + UsageHosts.OWN_PATH + "/" + UsageDay.keyOf(new Date()) + "/" + this.game + ".json?auth=" + encodeURIComponent(token) + "&print=silent";
            await fetch(address, { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.increments(snapshot, roundEnded)) });
        }
        catch (error) {
            return;
        }
    }
    increments(snapshot, roundEnded) {
        return {
            down: UsageReporter.add(snapshot.down),
            up: UsageReporter.add(snapshot.up),
            req: UsageReporter.add(snapshot.req),
            sec: UsageReporter.add(Math.min(snapshot.sec, 3600)),
            rounds: UsageReporter.add(roundEnded ? 1 : 0)
        };
    }
    static add(amount) {
        return { ".sv": { increment: amount } };
    }
}
class UsageMeter {
    constructor() {
        this.tally = new UsageTally();
        this.reporter = new UsageReporter(UsageGameName.fromPage(), this.tally);
        this.lastRoundAt = 0;
    }
    start() {
        if (location.protocol === "file:" || !UsageGameName.fromPage())
            return;
        new UsageFetchTap(this.tally).install();
        new UsageSocketTap(this.tally).install();
        window.addEventListener(UsageMeter.ROUND_END_EVENT, () => this.roundEnded());
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden")
            void this.reporter.send(false); });
    }
    roundEnded() {
        const now = Date.now();
        if (now - this.lastRoundAt < UsageMeter.MIN_GAP_MS)
            return;
        this.lastRoundAt = now;
        void this.reporter.send(true);
    }
}
UsageMeter.ROUND_END_EVENT = "portal-round-end";
UsageMeter.MIN_GAP_MS = 5000;
new UsageMeter().start();
