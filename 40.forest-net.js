"use strict";
class FrRestBackend {
    constructor(user) {
        this.user = user;
    }
    async get(path) {
        const response = await fetch(await this.url(path), { cache: "no-store" });
        if (!response.ok)
            throw new Error(String(response.status));
        return (await response.json());
    }
    async set(path, value) {
        await this.send("PUT", await this.url(path, "&print=silent"), value);
    }
    async patch(path, value) {
        await this.send("PATCH", await this.url(path, "&print=silent"), value);
    }
    async transaction(path, update) {
        for (let attempt = 0; attempt < FrRestBackend.RETRIES; attempt++) {
            const address = await this.url(path);
            const read = await fetch(address, { cache: "no-store", headers: { "X-Firebase-ETag": "true" } });
            if (!read.ok)
                throw new Error(String(read.status));
            const etag = read.headers.get("ETag") || "";
            const current = (await read.json());
            const next = update(current);
            if (next === undefined)
                return { committed: false, value: current };
            const write = await fetch(address, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "if-match": etag },
                body: JSON.stringify(next),
            });
            if (write.status === 412)
                continue;
            if (!write.ok)
                throw new Error(String(write.status));
            return { committed: true, value: next };
        }
        throw new Error("transaction-busy");
    }
    async lastChildren(path, count) {
        const query = "&orderBy=" + encodeURIComponent('"$key"') + "&limitToLast=" + count;
        const response = await fetch(await this.url(path, query), { cache: "no-store" });
        if (!response.ok)
            throw new Error(String(response.status));
        const data = (await response.json());
        return data ? Object.keys(data).sort().map((key) => [key, data[key]]) : [];
    }
    async serverTime(probePath) {
        await this.send("PUT", await this.url(probePath, "&print=silent"), { ".sv": "timestamp" });
        const value = await this.get(probePath);
        return typeof value === "number" ? value : Date.now();
    }
    async send(method, url, value) {
        const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
        if (!response.ok)
            throw new Error(String(response.status));
    }
    async url(path, extra = "") {
        const config = window.PORTAL_CONFIG;
        if (!config || !config.isReady())
            throw new Error("no-db");
        const token = await this.user.getToken();
        return config.DB_URL.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "") + ".json?auth=" + encodeURIComponent(token) + extra;
    }
}
FrRestBackend.RETRIES = 6;
class FrLocalBackend {
    constructor(persistent = true) {
        this.persistent = persistent;
        this.tree = persistent ? this.restore() : {};
    }
    async get(path) {
        return this.clone(this.read(path));
    }
    async set(path, value) {
        this.write(path, this.clone(value));
        this.persist();
    }
    async patch(path, value) {
        Object.keys(value).forEach((key) => this.write(path + "/" + key, this.clone(value[key])));
        this.persist();
    }
    async transaction(path, update) {
        const current = this.clone(this.read(path));
        const next = update(current);
        if (next === undefined)
            return { committed: false, value: current };
        this.write(path, this.clone(next));
        this.persist();
        return { committed: true, value: next };
    }
    async lastChildren(path, count) {
        const data = this.read(path);
        if (!data)
            return [];
        return Object.keys(data).sort().slice(-count).map((key) => [key, this.clone(data[key])]);
    }
    async serverTime() { return Date.now(); }
    parts(path) { return path.split("/").filter((p) => p.length > 0); }
    read(path) {
        let node = this.tree;
        for (const part of this.parts(path)) {
            if (node === null || typeof node !== "object")
                return null;
            node = node[part];
        }
        return node === undefined ? null : node;
    }
    write(path, value) {
        const parts = this.parts(path);
        let node = this.tree;
        for (let i = 0; i < parts.length - 1; i++) {
            const next = node[parts[i]];
            if (next === null || typeof next !== "object")
                node[parts[i]] = {};
            node = node[parts[i]];
        }
        const last = parts[parts.length - 1];
        if (value === null || value === undefined)
            delete node[last];
        else
            node[last] = value;
    }
    clone(value) { return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value)); }
    restore() {
        try {
            const stored = localStorage.getItem(FrLocalBackend.STORAGE_KEY);
            return stored ? JSON.parse(stored) : {};
        }
        catch (error) {
            return {};
        }
    }
    persist() {
        if (!this.persistent)
            return;
        try {
            localStorage.setItem(FrLocalBackend.STORAGE_KEY, JSON.stringify(this.tree));
        }
        catch (error) {
            return;
        }
    }
}
FrLocalBackend.STORAGE_KEY = "forest_local_v1";
class FrIdentity {
    static user() { return window.PORTAL_USER || window.PORTAL_GUEST || null; }
    static required(search) { return FrIdentity.LOGIN_LINK_PATTERN.test(search); }
    static async ready(search) {
        if (FrIdentity.user() || !FrIdentity.required(search))
            return FrIdentity.user();
        await new Promise((resolve) => {
            const timer = window.setTimeout(resolve, FrIdentity.WAIT_MS);
            document.addEventListener(FrIdentity.USER_EVENT, () => { window.clearTimeout(timer); resolve(); }, { once: true });
        });
        return FrIdentity.user();
    }
}
FrIdentity.LOGIN_LINK_PATTERN = /[?&]c=(?:[1-3]-[1-5]|contest|test)(?:&|$)/;
FrIdentity.USER_EVENT = "portal-user-changed";
FrIdentity.WAIT_MS = 25000;
class FrBackendChooser {
    static choose() {
        const user = FrIdentity.user();
        return user ? new FrRestBackend(user) : new FrLocalBackend();
    }
}
