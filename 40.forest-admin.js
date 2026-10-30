"use strict";
class FrAdminTools {
    constructor(backend, island, clock, world) {
        this.backend = backend;
        this.island = island;
        this.clock = clock;
        this.world = world;
    }
    path(rest) { return "forest/" + this.island + "/" + rest; }
    async sendCommand(uid, type) {
        await this.backend.set(this.path("admin/cmd/" + uid), { type, at: { ".sv": "timestamp" } });
    }
    async sendNotice(text) {
        await this.backend.set(this.path("admin/notice"), { text: text.slice(0, 80), at: { ".sv": "timestamp" } });
    }
    async setLock(lock) { await this.backend.set(this.path("admin/lock"), lock); }
    async give(id, amount) {
        const result = await this.backend.transaction(this.path("public/" + id), (current) => (current || 0) + amount);
        if (!result.committed)
            return false;
        const key = String(Date.now()).padStart(14, "0") + "_" + Math.floor(Math.random() * 1000);
        await this.backend.set(this.path("publicLog/" + key), { at: Date.now(), who: "선생님", verb: "admin", item: id, count: amount });
        this.world.remotePublic(id, result.value || 0);
        return true;
    }
    async wakeEveryone(roster) {
        await this.clock.skipToMorning();
        await Promise.all(roster.aliveUids().map((uid) => this.sendCommand(uid, "wake")));
    }
    async backup() {
        const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
        const snapshot = {};
        for (const part of FrAdminTools.BACKUP_PARTS)
            snapshot[part] = await this.backend.get(this.path(part));
        await this.backend.set("forestArchive/" + this.island + "/" + stamp, { at: { ".sv": "timestamp" }, data: snapshot });
        await this.prune();
        return stamp;
    }
    async list() {
        const rows = await this.backend.lastChildren("forestArchive/" + this.island, FrAdminTools.BACKUP_KEEP);
        return rows.map(([key]) => key).reverse();
    }
    async prune() {
        const all = await this.backend.get("forestArchive/" + this.island);
        const keys = Object.keys(all || {}).sort();
        for (const key of keys.slice(0, Math.max(0, keys.length - FrAdminTools.BACKUP_KEEP)))
            await this.backend.set("forestArchive/" + this.island + "/" + key, null);
    }
    async restore(stamp) {
        await this.backup();
        const saved = await this.backend.get("forestArchive/" + this.island + "/" + stamp);
        if (!saved)
            return;
        for (const part of FrAdminTools.BACKUP_PARTS)
            await this.backend.set(this.path(part), saved.data[part] === undefined ? null : saved.data[part]);
    }
}
FrAdminTools.BACKUP_KEEP = 5;
FrAdminTools.BACKUP_PARTS = ["jungle", "terrain", "snow", "build", "public"];
FrAdminTools.QUICK_NOTICES = ["잠시 선생님을 봐 주세요", "정리하고 광장에 모이세요", "수업을 마칩니다. 잠자기 전에 창고에 재료를 넣어요"];
class FrAdminWindow extends FrWindow {
    constructor(session, toast, tools, roster, admin, clock, island) {
        super("운영자 도구", session, toast);
        this.tools = tools;
        this.roster = roster;
        this.admin = admin;
        this.clock = clock;
        this.island = island;
    }
    render() {
        FrDom.clear(this.body);
        this.body.append(this.islandSection(), this.timeSection(), this.noticeSection(), this.giveSection(), this.backupSection(), this.studentSection());
    }
    section(title) {
        const box = FrDom.make("div", "fr-recipe");
        box.style.marginBottom = "10px";
        box.appendChild(FrDom.make("h3", "", title));
        return box;
    }
    islandSection() {
        const box = this.section("섬 (지금 " + this.island + " · 접속 " + this.roster.aliveUids().length + "명)");
        const input = FrDom.make("input", "st-input");
        input.placeholder = "예: 1-1_2 또는 test_1";
        input.style.cssText = "width:60%;margin:0 6px 0 0;padding:6px;font-size:14px";
        box.append(input, this.button("이 섬으로 들어가기", () => { if (input.value.trim())
            location.search = location.search.replace(/[?&]island=[^&]*/g, "") + (location.search ? "&" : "?") + "island=" + encodeURIComponent(input.value.trim()); }));
        return box;
    }
    timeSection() {
        const box = this.section("시간");
        const row = FrDom.make("div", "fr-row");
        [[360, "06:00"], [720, "12:00"], [1080, "18:00"]].forEach(([minute, label]) => row.appendChild(this.button(String(label), () => void this.clock.setMinute(Number(minute)))));
        row.appendChild(this.button(this.clock.state.frozen ? "시계 다시 흐르게" : "시계 멈춤", () => void this.clock.setFrozen(!this.clock.state.frozen).then(() => this.render())));
        row.appendChild(this.button("모두 깨우기(06:00)", () => void this.tools.wakeEveryone(this.roster)));
        row.appendChild(this.button(this.admin.state.lock ? "섬 멈춤 풀기" : "섬 멈춤(걷기만)", () => void this.tools.setLock(!this.admin.state.lock).then(() => this.render())));
        box.appendChild(row);
        return box;
    }
    noticeSection() {
        const box = this.section("공지 (모든 화면 위 10초)");
        const input = FrDom.make("input", "st-input");
        input.maxLength = 80;
        input.placeholder = "공지 내용";
        input.style.cssText = "width:70%;margin:0 6px 0 0;padding:6px;font-size:14px";
        box.append(input, this.button("보내기", () => { if (input.value.trim())
            void this.tools.sendNotice(input.value.trim()); }));
        const row = FrDom.make("div", "fr-row");
        FrAdminTools.QUICK_NOTICES.forEach((text) => row.appendChild(this.button(text, () => void this.tools.sendNotice(text))));
        box.appendChild(row);
        return box;
    }
    giveSection() {
        const box = this.section("공용 창고에 재료 넣기");
        const select = FrDom.make("select");
        FrCatalog.MATERIALS.filter((m) => m.category !== "block").forEach((m) => { const o = FrDom.make("option", "", m.name); o.value = m.id; select.appendChild(o); });
        const amount = FrDom.make("input", "st-input");
        amount.type = "number";
        amount.value = "10";
        amount.style.cssText = "width:80px;margin:0 6px;padding:6px;font-size:14px";
        box.append(select, amount, this.button("넣기", () => void this.tools.give(select.value, Math.max(1, Math.min(900, Math.floor(Number(amount.value) || 1)))).then((ok) => this.toast.show(ok ? "넣었어요" : "넣지 못했어요"))));
        return box;
    }
    backupSection() {
        const box = this.section("섬 백업·되돌리기 (최근 " + FrAdminTools.BACKUP_KEEP + "개)");
        const list = FrDom.make("div", "fr-note");
        const row = FrDom.make("div", "fr-row");
        row.appendChild(this.button("지금 백업", () => void this.tools.backup().then((stamp) => { this.toast.show("백업했어요 " + stamp); this.render(); })));
        box.append(row, list);
        void this.tools.list().then((stamps) => stamps.forEach((stamp) => {
            const line = FrDom.make("div", "fr-line");
            line.appendChild(FrDom.make("span", "", stamp));
            line.appendChild(this.button("되돌리기", () => {
                if (!window.confirm(stamp + " 로 되돌릴까요? 지금 상태는 먼저 자동 백업해요."))
                    return;
                if (!window.confirm("정말로 되돌립니다. 학생들은 새로 고침해야 해요."))
                    return;
                void this.tools.restore(stamp).then(() => this.toast.show("되돌렸어요. 새로 고침해 주세요."));
            }));
            list.appendChild(line);
        }));
        return box;
    }
    studentSection() {
        const box = this.section("학생 (번호순)");
        const members = Array.from(this.roster.members.entries()).filter(([, m]) => !m.adm).sort((a, b) => a[1].no - b[1].no);
        members.forEach(([uid, member]) => {
            const alive = this.roster.alive(uid);
            const row = this.roster.presence.get(uid);
            const line = FrDom.make("div", "fr-line");
            line.appendChild(FrDom.make("span", "", member.no + " " + member.name + " · " + (alive ? (row && row.sleeping ? "잠" : FrSleepVote.areaLabel(row ? row.area : "island")) : "접속 안 함")));
            if (alive) {
                line.appendChild(this.button("광장으로", () => void this.tools.sendCommand(uid, "plaza")));
                line.appendChild(this.button("깨우기", () => void this.tools.sendCommand(uid, "wake")));
            }
            box.appendChild(line);
        });
        if (members.length === 0)
            box.appendChild(FrDom.make("div", "fr-note", "아직 들어온 학생이 없어요"));
        return box;
    }
}
class FrBoardPage {
    static requested(search) { return /[?&]board(?:=|&|$)/.test(search); }
    static islandsFor(search) {
        const link = FrIslandLink.linkClass(search);
        return FrIslandLink.CLASS_PATTERN.test(link) ? [link + "_1", link + "_2"] : [FrIslandLink.TEST_ISLAND];
    }
    constructor(backend, terrainFile, uid) {
        this.backend = backend;
        this.terrainFile = terrainFile;
        this.uid = uid;
        this.views = [];
    }
    async start(islands) {
        const root = FrDom.make("div", "fr-board");
        document.body.appendChild(root);
        for (const island of islands) {
            const world = new FrWorld(island, new FrTerrainData(this.terrainFile), this.backend);
            await world.load();
            const clock = new FrClockSync(this.backend, island, this.uid);
            clock.state = (await this.backend.get("forest/" + island + "/clock")) || clock.state;
            const roster = new FrRoster();
            const hub = new FrSyncHub();
            hub.register("jungle", new FrJungleNode(world));
            hub.register("terrain", new FrTerrainNode(world));
            hub.register("build", new FrBuildNode(world));
            hub.register("public", new FrPublicNode(world));
            hub.register("clock", new FrClockNode(clock));
            hub.register("members", new FrMembersNode(roster));
            hub.register("presence", new FrPresenceNode(roster));
            hub.register("pos", new FrPoseNode(roster));
            hub.start(this.backend, island);
            const panel = FrDom.make("div", "fr-board-island");
            const canvas = FrDom.make("canvas");
            canvas.width = this.terrainFile.w * FrBoardPage.CELL_PIXELS;
            canvas.height = canvas.width;
            const info = FrDom.make("div", "fr-board-info");
            panel.append(FrDom.make("h2", "", island), canvas, info);
            root.appendChild(panel);
            this.views.push({ island, world, clock, roster, canvas, info, hub });
        }
        window.setInterval(() => this.draw(), 500);
        this.draw();
    }
    draw() {
        this.views.forEach((view) => { this.drawMap(view); this.drawInfo(view); });
    }
    drawMap(view) {
        const g = view.canvas.getContext("2d");
        const P = FrBoardPage.CELL_PIXELS, terrain = view.world.terrain;
        for (let z = 0; z < terrain.d; z++)
            for (let x = 0; x < terrain.w; x++) {
                g.fillStyle = FrBoardPage.TOP_COLORS[terrain.top(x, z)] || "#6FA352";
                g.fillRect(x * P, z * P, P, P);
            }
        view.world.trees.forEach((spot, index) => { if (!view.world.isFelled(index)) {
            g.fillStyle = "rgba(30,90,40,0.8)";
            g.fillRect(spot.x * P, spot.z * P, P, P);
        } });
        const a = terrain.anchors;
        g.fillStyle = "#FF8C00";
        g.fillRect(a.campfire.x * P - 2, a.campfire.z * P - 2, P + 4, P + 4);
        view.roster.aliveUids().forEach((uid) => {
            const pose = view.roster.poses.get(uid), member = view.roster.members.get(uid);
            if (!pose || !member || member.adm)
                return;
            const px = (pose.x / FrTerrainData.BLOCK) * P, pz = (pose.z / FrTerrainData.BLOCK) * P;
            g.fillStyle = "#FFFFFF";
            g.beginPath();
            g.arc(px, pz, 4, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#D97B4F";
            g.beginPath();
            g.arc(px, pz, 2.5, 0, Math.PI * 2);
            g.fill();
        });
    }
    drawInfo(view) {
        FrDom.clear(view.info);
        const minute = view.clock.minuteOfDay();
        view.info.appendChild(FrDom.make("div", "fr-board-line", FrClock.label(minute) + " · " + view.clock.day() + "일째 · 마을 " + view.world.village.level() + "단계"));
        const day = view.clock.day();
        const presences = view.roster.asPresences(day, "", { uid: "", name: "", area: "island", sleeping: false, actedToday: false }).filter((p) => p.uid !== "");
        view.info.appendChild(FrDom.make("div", "fr-board-line", FrClock.isNight(minute) ? FrSleepVote.banner(presences) : "접속 " + presences.length + "명"));
        const store = FrDom.make("div", "fr-board-store");
        const amounts = view.world.publicStore.amountsSnapshot();
        Object.keys(amounts).forEach((id) => {
            const cell = FrDom.make("span", "fr-board-item");
            cell.append(FrIcons.image(id, 26), FrDom.make("b", "", String(amounts[id])));
            store.appendChild(cell);
        });
        view.info.appendChild(store);
    }
}
FrBoardPage.CELL_PIXELS = 3;
FrBoardPage.TOP_COLORS = { G: "#6FA352", D: "#96704A", S: "#808084", N: "#E2D096", W: "#F6F8FA", R: "#4682C8", O: "#28508C", P: "#C4A86E" };
