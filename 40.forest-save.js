"use strict";
class FrIslandLink {
    static linkClass(search) {
        const match = /[?&]c=([^&]*)/.exec(search);
        return match ? decodeURIComponent(match[1]) : "";
    }
    static needsCode(search) {
        const link = FrIslandLink.linkClass(search);
        return FrIslandLink.CLASS_PATTERN.test(link) || link === "contest";
    }
    static autoIsland(search) {
        const link = FrIslandLink.linkClass(search);
        if (link === "test")
            return FrIslandLink.TEST_ISLAND;
        return FrIslandLink.needsCode(search) ? null : FrIslandLink.LOCAL_ISLAND;
    }
    static accepts(search, code) {
        const link = FrIslandLink.linkClass(search);
        return link === "contest" ? code.cls === "test" : code.cls === link;
    }
    static islandKey(code) { return code.cls + "_" + code.island; }
}
FrIslandLink.TEST_ISLAND = "test_1";
FrIslandLink.LOCAL_ISLAND = "local_1";
FrIslandLink.CLASS_PATTERN = /^[1-3]-[1-5]$/;
class FrIslandJoin {
    constructor(backend, uid, search) {
        this.backend = backend;
        this.uid = uid;
        this.search = search;
    }
    async existingHome() {
        return this.backend.get("users/" + this.uid + "/forest/home");
    }
    async joinWithCode(rawCode) {
        const code = rawCode.trim().toLowerCase();
        if (!/^[a-z0-9가-힣]{2,12}$/.test(code))
            return { island: null, message: "섬 코드를 다시 확인해 주세요." };
        const found = await this.backend.get("forestCodes/" + code);
        if (!found)
            return { island: null, message: "없는 섬 코드예요." };
        if (!FrIslandLink.accepts(this.search, found))
            return { island: null, message: "이 링크에서는 쓸 수 없는 코드예요." };
        return this.claim(FrIslandLink.islandKey(found));
    }
    async joinAutomatically(island) {
        return this.claim(island);
    }
    async claim(island) {
        const result = await this.backend.transaction("users/" + this.uid + "/forest/home", (current) => (current === null ? island : undefined));
        return { island: result.value, message: "" };
    }
}
class FrAccountSave {
    constructor(backend, uid) {
        this.backend = backend;
        this.uid = uid;
        this.pending = null;
        this.timer = 0;
    }
    path(rest) { return "users/" + this.uid + "/forest/" + rest; }
    async load() {
        const stored = await this.backend.get(this.path("save"));
        return {
            bag: stored && stored.bag ? stored.bag : [],
            ap: stored && typeof stored.ap === "number" ? stored.ap : FrBalance.BASE_ACTION_POINTS,
            ring: stored && typeof stored.ring === "number" ? stored.ring : 0,
            pity: stored && stored.pity ? stored.pity : {},
            seen: stored && stored.seen ? stored.seen : [],
            lastAt: stored && stored.lastAt ? stored.lastAt : 0,
        };
    }
    queue(data) {
        this.pending = data;
        if (this.timer)
            return;
        this.timer = window.setTimeout(() => { this.timer = 0; void this.flush(); }, FrAccountSave.SAVE_INTERVAL_MS);
    }
    async flush() {
        if (!this.pending)
            return;
        const data = this.pending;
        this.pending = null;
        await this.backend.set(this.path("save"), data);
    }
    async clearHomeForTest() { await this.backend.set(this.path("home"), null); }
}
FrAccountSave.SAVE_INTERVAL_MS = 2000;
