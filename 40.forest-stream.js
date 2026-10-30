"use strict";
class FrStream {
    constructor(address, sink) {
        this.address = address;
        this.sink = sink;
        this.bytes = 0;
        this.events = 0;
        this.connected = false;
        this.stopped = false;
        this.controller = null;
    }
    start() {
        this.stopped = false;
        void this.loop();
    }
    stop() {
        this.stopped = true;
        if (this.controller)
            this.controller.abort();
    }
    async loop() {
        while (!this.stopped) {
            try {
                await this.connectOnce();
            }
            catch (error) {
                this.connected = false;
            }
            if (!this.stopped)
                await new Promise((resolve) => setTimeout(resolve, FrStream.RETRY_MS));
        }
    }
    async connectOnce() {
        this.controller = new AbortController();
        const refresh = setTimeout(() => { if (this.controller)
            this.controller.abort(); }, FrStream.REFRESH_MS);
        try {
            const response = await fetch(await this.address(), { headers: { Accept: "text/event-stream" }, signal: this.controller.signal });
            if (!response.ok || !response.body)
                throw new Error(String(response.status));
            this.connected = true;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                this.bytes += chunk.value.length;
                buffer += decoder.decode(chunk.value, { stream: true });
                let split = buffer.indexOf("\n\n");
                while (split >= 0) {
                    this.handle(buffer.slice(0, split));
                    buffer = buffer.slice(split + 2);
                    split = buffer.indexOf("\n\n");
                }
            }
        }
        finally {
            clearTimeout(refresh);
            this.connected = false;
        }
    }
    handle(block) {
        let kind = "";
        let data = "";
        block.split("\n").forEach((line) => {
            if (line.indexOf("event:") === 0)
                kind = line.slice(6).trim();
            else if (line.indexOf("data:") === 0)
                data += line.slice(5).trim();
        });
        if (kind === "cancel" || kind === "auth_revoked") {
            if (this.controller)
                this.controller.abort();
            return;
        }
        if (kind !== "put" && kind !== "patch")
            return;
        const payload = JSON.parse(data);
        const base = payload.path.split("/").filter((p) => p.length > 0);
        this.events += 1;
        if (kind === "put") {
            this.sink.onValue(base, payload.data);
            return;
        }
        const children = (payload.data || {});
        Object.keys(children).forEach((key) => this.sink.onValue(base.concat(key.split("/").filter((p) => p.length > 0)), children[key]));
    }
}
FrStream.RETRY_MS = 1500;
FrStream.REFRESH_MS = 50 * 60 * 1000;
