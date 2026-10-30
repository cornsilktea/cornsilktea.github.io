class FrAdminTools {
  static readonly BACKUP_KEEP = 5;
  static readonly BACKUP_PARTS = ["jungle", "terrain", "snow", "build", "public", "blocks", "lots", "farm"];
  static readonly QUICK_NOTICES = ["잠시 선생님을 봐 주세요", "정리하고 광장에 모이세요", "수업을 마칩니다. 잠자기 전에 창고에 재료를 넣어요"];

  constructor(private readonly backend: FrBackend, private readonly island: string, private readonly clock: FrClockSync, private readonly world: FrWorld, private readonly who = "선생님") {}

  private path(rest: string): string { return "forest/" + this.island + "/" + rest; }

  async log(action: string, detail: string): Promise<void> {
    const key = String(Date.now()).padStart(14, "0") + "_" + Math.floor(Math.random() * 1000);
    await this.backend.set("forestAdminLog/" + this.island + "/" + key, { at: Date.now(), by: this.who, action, detail: detail.slice(0, 120) });
  }

  async recentLog(count: number): Promise<Array<{ at: number; by: string; action: string; detail: string }>> {
    const rows = await this.backend.lastChildren<{ at: number; by: string; action: string; detail: string }>("forestAdminLog/" + this.island, count);
    return rows.map(([, row]) => row).reverse();
  }

  async sendCommand(uid: string, type: string, id = "", n = 0): Promise<void> {
    const command: Record<string, unknown> = { type, at: { ".sv": "timestamp" } };
    if (id) command.id = id;
    if (n) command.n = n;
    await this.backend.set(this.path("admin/cmd/" + uid), command);
    if (type !== "wake" && type !== "plaza") await this.log("학생 명령 " + type, uid + (id ? " " + id : "") + (n ? " ×" + n : ""));
  }

  async forceBuild(site: FrBuildSite): Promise<boolean> {
    if (this.world.isBuilt(site.id)) return false;
    const result = await this.backend.transaction<FrBuildRecord>(this.path("build/" + site.id), (current) => (current === null ? { at: Date.now(), by: this.who } : undefined));
    if (!result.committed) return false;
    this.world.remoteBuilt(site.id);
    await this.log("건설 즉시", site.name + " " + site.id);
    return true;
  }

  async removeBuilt(site: FrBuildSite, refund: boolean): Promise<boolean> {
    const done = await this.world.unbuild(site.id, refund);
    if (done) await this.log("건설 철거" + (refund ? "(환급)" : ""), site.name + " " + site.id);
    return done;
  }

  async removePublic(id: string, amount: number): Promise<boolean> {
    const result = await this.backend.transaction<number>(this.path("public/" + id), (current) => ((current || 0) >= amount ? ((current || 0) - amount || null) : undefined));
    if (!result.committed) return false;
    this.world.remotePublic(id, result.value || 0);
    const key = String(Date.now()).padStart(14, "0") + "_" + Math.floor(Math.random() * 1000);
    await this.backend.set(this.path("publicLog/" + key), { at: Date.now(), who: this.who, verb: "take", item: id, count: amount });
    await this.log("창고에서 뺌", id + " ×" + amount);
    return true;
  }

  async restoreTerrain(x: number, z: number, radius: number): Promise<number> {
    const keep = new Set<number>();
    this.world.sites.forEach((site) => { if (this.world.isBuilt(site.id)) site.effect.forEach((c) => keep.add(this.world.terrain.index(c.x, c.z))); });
    const chunks = new Map<string, Record<string, null>>();
    const cells: FrPoint[] = [];
    for (let cz = z - radius; cz <= z + radius; cz++) for (let cx = x - radius; cx <= x + radius; cx++) {
      if (!this.world.terrain.inside(cx, cz) || Math.hypot(cx - x, cz - z) > radius || keep.has(this.world.terrain.index(cx, cz)) || !this.world.terrain.editOf(cx, cz)) continue;
      cells.push({ x: cx, z: cz });
      const chunk = Math.floor(cx / FrTerrainMesher.CHUNK) + "_" + Math.floor(cz / FrTerrainMesher.CHUNK);
      if (!chunks.has(chunk)) chunks.set(chunk, {});
      (chunks.get(chunk) as Record<string, null>)[String(this.world.terrain.index(cx, cz))] = null;
    }
    for (const [chunk, values] of chunks) await this.backend.patch(this.path("terrain/" + chunk), values);
    cells.forEach((c) => this.world.revertTerrainLocal(c.x, c.z));
    await this.log("지형 되돌리기", "(" + x + "," + z + ") 반경 " + radius + " · " + cells.length + "칸");
    return cells.length;
  }

  async peek(uid: string): Promise<string[]> {
    const save = await this.backend.get<FrSaveData>("users/" + uid + "/forest/save");
    if (!save) return ["저장된 기록이 없어요"];
    const lines = ["행동력 " + save.ap + " (반지 +" + save.ring + ", 보너스 " + (save.bonus || 0) + ")"];
    lines.push("가방: " + (save.bag.length > 0 ? save.bag.map((s) => FrItemNames.label(s.id) + "×" + s.count).join(", ") : "비어 있음"));
    const chest = save.chest || {};
    lines.push("내 창고: " + (Object.keys(chest).length > 0 ? Object.keys(chest).map((id) => FrItemNames.label(id) + "×" + chest[id]).join(", ") : "비어 있음"));
    return lines;
  }

  async sendNotice(text: string): Promise<void> {
    await this.backend.set(this.path("admin/notice"), { text: text.slice(0, 80), at: { ".sv": "timestamp" } });
  }

  async setLock(lock: boolean): Promise<void> { await this.backend.set(this.path("admin/lock"), lock); await this.log(lock ? "섬 멈춤" : "섬 멈춤 풀기", this.island); }

  async give(id: string, amount: number): Promise<boolean> {
    const result = await this.backend.transaction<number>(this.path("public/" + id), (current) => (current || 0) + amount);
    if (!result.committed) return false;
    const key = String(Date.now()).padStart(14, "0") + "_" + Math.floor(Math.random() * 1000);
    await this.backend.set(this.path("publicLog/" + key), { at: Date.now(), who: "선생님", verb: "admin", item: id, count: amount });
    this.world.remotePublic(id, result.value || 0);
    await this.log("창고에 넣음", id + " ×" + amount);
    return true;
  }

  async clearAround(x: number, z: number, radius: number): Promise<number> {
    const count = await this.world.clearBlocks((_record, bx, bz) => Math.hypot(bx - x, bz - z) <= radius);
    await this.log("주변 블록 지움", "(" + x + "," + z + ") 반경 " + radius + " · " + count + "개");
    return count;
  }

  async clearOf(no: number): Promise<number> {
    const count = await this.world.clearBlocks((record) => record.n === no);
    await this.log("학생 블록 치움", no + "번 · " + count + "개");
    return count;
  }

  async emptyLot(index: number): Promise<number> {
    const lot = this.world.terrain.anchors.lots[index];
    const removed = await this.world.clearBlocks((_r, bx, bz) => bx >= lot.x && bx < lot.x + lot.size && bz >= lot.z && bz < lot.z + lot.size);
    await this.world.releaseLot(index);
    await this.log("집터 비움", (index + 1) + "번 · " + removed + "개");
    return removed;
  }

  async wakeEveryone(roster: FrRoster): Promise<void> {
    await this.clock.skipToMorning();
    await Promise.all(roster.aliveUids().map((uid) => this.sendCommand(uid, "wake")));
  }

  async backup(): Promise<string> {
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const snapshot: Record<string, unknown> = {};
    for (const part of FrAdminTools.BACKUP_PARTS) snapshot[part] = await this.backend.get<unknown>(this.path(part));
    await this.backend.set("forestArchive/" + this.island + "/" + stamp, { at: { ".sv": "timestamp" }, data: snapshot });
    await this.prune();
    await this.log("백업", stamp);
    return stamp;
  }

  async list(): Promise<string[]> {
    const rows = await this.backend.lastChildren<unknown>("forestArchive/" + this.island, FrAdminTools.BACKUP_KEEP);
    return rows.map(([key]) => key).reverse();
  }

  private async prune(): Promise<void> {
    const all = await this.backend.get<Record<string, unknown>>("forestArchive/" + this.island);
    const keys = Object.keys(all || {}).sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - FrAdminTools.BACKUP_KEEP))) await this.backend.set("forestArchive/" + this.island + "/" + key, null);
  }

  async restore(stamp: string): Promise<void> {
    await this.backup();
    const saved = await this.backend.get<{ data: Record<string, unknown> }>("forestArchive/" + this.island + "/" + stamp);
    if (!saved) return;
    for (const part of FrAdminTools.BACKUP_PARTS) await this.backend.set(this.path(part), saved.data[part] === undefined ? null : saved.data[part]);
    await this.log("되돌리기", stamp);
  }
}

class FrAdminWindow extends FrWindow {
  constructor(session: FrSession, toast: FrToast, private readonly tools: FrAdminTools, private readonly roster: FrRoster, private readonly admin: FrAdminNode, private readonly clock: FrClockSync, private readonly island: string) {
    super("운영자 도구", session, toast);
  }

  render(): void {
    FrDom.clear(this.body);
    this.body.append(this.islandSection(), this.moveSection(), this.timeSection(), this.noticeSection(), this.giveSection(), this.buildSection(), this.blockSection(), this.backupSection(), this.studentSection(), this.logSection());
  }

  travel: (areaId: string) => void = () => undefined;
  teleport: (x: number, z: number) => void = () => undefined;
  private peekLines: string[] = [];
  private studentItem = "wood";
  private studentAmount = 10;
  private startedAt = Date.now();

  private moveSection(): HTMLDivElement {
    const box = this.section("자유 이동 · 데이터 사용량");
    const row = FrDom.make("div", "fr-row");
    [["island", "마을"], ["fruit", "과일 숲"], ["beach", "해변"], ["mine", "광산"]].forEach(([id, label]) => row.appendChild(this.button(label, () => this.travel(id))));
    box.appendChild(row);
    const x = FrDom.make("input", "st-input");
    const z = FrDom.make("input", "st-input");
    [x, z].forEach((input, i) => { input.type = "number"; input.placeholder = i === 0 ? "가로 칸" : "세로 칸"; input.style.cssText = "width:90px;margin:0 6px 0 0;padding:6px;font-size:14px"; });
    box.append(x, z, this.button("섬 좌표로 이동", () => { if (x.value && z.value) this.teleport(Number(x.value), Number(z.value)); }));
    const minutes = Math.max(1 / 60, (Date.now() - this.startedAt) / 60000);
    box.appendChild(FrDom.make("div", "fr-note", "받은 데이터(대략) " + Math.round(FrStream.received / 1024) + " KB · 분당 약 " + Math.round(FrStream.received / 1024 / minutes) + " KB (실시간 연결만 셈)"));
    box.appendChild(this.button("새로 재기", () => { this.startedAt = Date.now(); FrStream.received = 0; this.render(); }));
    return box;
  }

  private buildSection(): HTMLDivElement {
    const box = this.section("마을 건설 (마을 " + this.session.world.village.level() + "단계 · 점수 " + this.session.world.village.score() + ")");
    box.appendChild(FrDom.make("div", "fr-note", "즉시 짓기는 재료를 쓰지 않아요. 철거는 재료를 창고로 돌려줘요."));
    const kinds = FrCatalog.CONSTRUCTIONS.map((c) => c.id);
    kinds.forEach((defId) => {
      const sites = this.session.world.sites.filter((s) => s.defId === defId);
      if (sites.length === 0) return;
      const line = FrDom.make("div", "fr-line");
      const done = sites.filter((s) => this.session.world.isBuilt(s.id)).length;
      line.appendChild(FrDom.make("span", "", sites[0].name + " " + done + "/" + sites.length));
      const next = sites.find((s) => !this.session.world.isBuilt(s.id));
      const last = sites.slice().reverse().find((s) => this.session.world.isBuilt(s.id));
      if (next) line.appendChild(this.button("즉시 짓기", () => void this.tools.forceBuild(next).then(() => this.render())));
      if (last) line.appendChild(this.button("철거(환급)", () => { if (window.confirm(last.name + " " + last.number + "번을 철거할까요?")) void this.tools.removeBuilt(last, true).then(() => this.render()); }));
      box.appendChild(line);
    });
    const take = FrDom.make("div", "fr-row");
    const select = FrDom.make("select");
    FrCatalog.MATERIALS.filter((m) => m.category !== "block").forEach((m) => { const o = FrDom.make("option", "", m.name); o.value = m.id; select.appendChild(o); });
    const amount = FrDom.make("input", "st-input");
    amount.type = "number";
    amount.value = "10";
    amount.style.cssText = "width:80px;margin:0 6px;padding:6px;font-size:14px";
    take.append(FrDom.make("span", "", "공용 창고에서 빼기"), select, amount, this.button("빼기", () => void this.tools.removePublic(select.value, Math.max(1, Math.floor(Number(amount.value) || 1))).then((ok) => this.toast.show(ok ? "뺐어요" : "그만큼 없어요"))));
    box.appendChild(take);
    return box;
  }

  private logSection(): HTMLDivElement {
    const box = this.section("운영 기록 (최근 15개)");
    const list = FrDom.make("div", "fr-note");
    box.appendChild(list);
    void this.tools.recentLog(15).then((rows) => {
      if (rows.length === 0) list.textContent = "아직 기록이 없어요";
      rows.forEach((row) => { const t = new Date(row.at); list.appendChild(FrDom.make("div", "fr-log", (t.getMonth() + 1) + "/" + t.getDate() + " " + t.getHours() + ":" + String(t.getMinutes()).padStart(2, "0") + " " + row.by + " · " + row.action + " · " + row.detail)); });
    });
    return box;
  }

  private section(title: string): HTMLDivElement {
    const box = FrDom.make("div", "fr-recipe");
    box.style.marginBottom = "10px";
    box.appendChild(FrDom.make("h3", "", title));
    return box;
  }

  private islandSection(): HTMLDivElement {
    const box = this.section("섬 (지금 " + this.island + " · 접속 " + this.roster.aliveUids().length + "명)");
    const input = FrDom.make("input", "st-input");
    input.placeholder = "예: 1-1_2 또는 test_1";
    input.style.cssText = "width:60%;margin:0 6px 0 0;padding:6px;font-size:14px";
    box.append(input, this.button("이 섬으로 들어가기", () => { if (input.value.trim()) location.search = location.search.replace(/[?&]island=[^&]*/g, "") + (location.search ? "&" : "?") + "island=" + encodeURIComponent(input.value.trim()); }));
    return box;
  }

  private timeSection(): HTMLDivElement {
    const box = this.section("시간");
    const row = FrDom.make("div", "fr-row");
    [[360, "06:00"], [720, "12:00"], [1080, "18:00"]].forEach(([minute, label]) => row.appendChild(this.button(String(label), () => void this.clock.setMinute(Number(minute)))));
    row.appendChild(this.button(this.clock.state.frozen ? "시계 다시 흐르게" : "시계 멈춤", () => void this.clock.setFrozen(!this.clock.state.frozen).then(() => this.render())));
    row.appendChild(this.button("모두 깨우기(06:00)", () => void this.tools.wakeEveryone(this.roster)));
    row.appendChild(this.button(this.admin.state.lock ? "섬 멈춤 풀기" : "섬 멈춤(걷기만)", () => void this.tools.setLock(!this.admin.state.lock).then(() => this.render())));
    box.appendChild(row);
    return box;
  }

  private noticeSection(): HTMLDivElement {
    const box = this.section("공지 (모든 화면 위 10초)");
    const input = FrDom.make("input", "st-input");
    input.maxLength = 80;
    input.placeholder = "공지 내용";
    input.style.cssText = "width:70%;margin:0 6px 0 0;padding:6px;font-size:14px";
    box.append(input, this.button("보내기", () => { if (input.value.trim()) void this.tools.sendNotice(input.value.trim()); }));
    const row = FrDom.make("div", "fr-row");
    FrAdminTools.QUICK_NOTICES.forEach((text) => row.appendChild(this.button(text, () => void this.tools.sendNotice(text))));
    box.appendChild(row);
    return box;
  }

  private giveSection(): HTMLDivElement {
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

  private blockSection(): HTMLDivElement {
    const box = this.section("블록·집터 (운영자 손은 모든 블록을 바로 부숴요)");
    const row = FrDom.make("div", "fr-row");
    row.appendChild(this.button("내 주변 6칸 지형 되돌리기", () => {
      const player = this.focus();
      if (player && window.confirm("내 주변 6칸의 파고 쌓은 지형을 처음 모양으로 되돌릴까요?")) void this.tools.restoreTerrain(player.x, player.z, 6).then((n) => this.toast.show(n + "칸을 되돌렸어요"));
    }));
    row.appendChild(this.button("내 주변 6칸 블록 지우기", () => {
      const player = this.focus();
      if (player && window.confirm("내 주변 6칸의 블록을 모두 지울까요?")) void this.tools.clearAround(player.x, player.z, 6).then((n) => this.toast.show(n + "개를 지웠어요"));
    }));
    box.appendChild(row);
    this.session.world.lots.forEach((lot, index) => {
      const line = FrDom.make("div", "fr-line");
      line.appendChild(FrDom.make("span", "", (index + 1) + "번 집터: " + lot.name));
      line.appendChild(this.button("집터 비우기", () => { if (window.confirm((index + 1) + "번 집터의 블록을 지우고 주인을 비울까요?")) void this.tools.emptyLot(index).then(() => this.render()); }));
      box.appendChild(line);
    });
    return box;
  }

  focus: () => FrPoint | null = () => null;

  private backupSection(): HTMLDivElement {
    const box = this.section("섬 백업·되돌리기 (최근 " + FrAdminTools.BACKUP_KEEP + "개)");
    const list = FrDom.make("div", "fr-note");
    const row = FrDom.make("div", "fr-row");
    row.appendChild(this.button("지금 백업", () => void this.tools.backup().then((stamp) => { this.toast.show("백업했어요 " + stamp); this.render(); })));
    box.append(row, list);
    void this.tools.list().then((stamps) => stamps.forEach((stamp) => {
      const line = FrDom.make("div", "fr-line");
      line.appendChild(FrDom.make("span", "", stamp));
      line.appendChild(this.button("되돌리기", () => {
        if (!window.confirm(stamp + " 로 되돌릴까요? 지금 상태는 먼저 자동 백업해요.")) return;
        if (!window.confirm("정말로 되돌립니다. 학생들은 새로 고침해야 해요.")) return;
        void this.tools.restore(stamp).then(() => this.toast.show("되돌렸어요. 새로 고침해 주세요."));
      }));
      list.appendChild(line);
    }));
    return box;
  }

  private studentSection(): HTMLDivElement {
    const box = this.section("학생 (번호순)");
    const pick = FrDom.make("div", "fr-row");
    const item = FrDom.make("select");
    FrCatalog.MATERIALS.filter((m) => m.category !== "block").forEach((m) => { const o = FrDom.make("option", "", m.name); o.value = m.id; item.appendChild(o); });
    item.value = this.studentItem;
    item.addEventListener("change", () => { this.studentItem = item.value; });
    const count = FrDom.make("input", "st-input");
    count.type = "number";
    count.value = String(this.studentAmount);
    count.style.cssText = "width:80px;margin:0 6px;padding:6px;font-size:14px";
    count.addEventListener("input", () => { this.studentAmount = Math.max(1, Math.min(900, Math.floor(Number(count.value) || 1))); });
    pick.append(FrDom.make("span", "", "학생에게 줄 재료"), item, count);
    box.appendChild(pick);
    const members = Array.from(this.roster.members.entries()).filter(([, m]) => !m.adm).sort((a, b) => a[1].no - b[1].no);
    members.forEach(([uid, member]) => {
      const alive = this.roster.alive(uid);
      const row = this.roster.presence.get(uid);
      const line = FrDom.make("div", "fr-line");
      line.appendChild(FrDom.make("span", "", member.no + " " + member.name + " · " + (alive ? (row && row.sleeping ? "잠" : FrSleepVote.areaLabel(row ? row.area : "island")) : "접속 안 함")));
      line.appendChild(this.button("블록 치우기", () => { if (window.confirm(member.name + " 학생의 블록을 모두 치울까요?")) void this.tools.clearOf(member.no).then((n) => this.toast.show(n + "개를 치웠어요")); }));
      line.appendChild(this.button("가방 보기", () => void this.tools.peek(uid).then((lines) => { this.peekLines = [member.name + " 학생"].concat(lines); this.render(); })));
      if (alive) {
        line.appendChild(this.button("광장으로", () => void this.tools.sendCommand(uid, "plaza")));
        line.appendChild(this.button("깨우기", () => void this.tools.sendCommand(uid, "wake")));
        line.appendChild(this.button("행동력 채우기", () => void this.tools.sendCommand(uid, "apfill")));
        line.appendChild(this.button("최대 +10", () => void this.tools.sendCommand(uid, "apbonus", "", 10)));
        line.appendChild(this.button("섬으로", () => void this.tools.sendCommand(uid, "exit")));
        line.appendChild(this.button("재료 주기", () => void this.tools.sendCommand(uid, "give", this.studentItem, this.studentAmount)));
      }
      box.appendChild(line);
    });
    this.peekLines.forEach((text) => box.appendChild(FrDom.make("div", "fr-note", text)));
    if (members.length === 0) box.appendChild(FrDom.make("div", "fr-note", "아직 들어온 학생이 없어요"));
    return box;
  }
}

class FrBoardPage {
  static readonly CELL_PIXELS = 3;
  private static readonly TOP_COLORS: Readonly<Record<string, string>> = { G: "#6FA352", D: "#96704A", S: "#808084", N: "#E2D096", W: "#F6F8FA", R: "#4682C8", O: "#28508C", P: "#C4A86E" };

  private readonly views: Array<{ island: string; world: FrWorld; clock: FrClockSync; roster: FrRoster; canvas: HTMLCanvasElement; info: HTMLDivElement; hub: FrSyncHub }> = [];

  static requested(search: string): boolean { return /[?&]board(?:=|&|$)/.test(search); }

  static islandsFor(search: string): string[] {
    const link = FrIslandLink.linkClass(search);
    return FrIslandLink.CLASS_PATTERN.test(link) ? [1, 2, 3].map((n) => link + "_" + n) : [FrIslandLink.TEST_ISLAND];
  }

  constructor(private readonly backend: FrBackend, private readonly terrainFile: FrTerrainFile, private readonly uid: string) {}

  async start(islands: string[]): Promise<void> {
    const root = FrDom.make("div", "fr-board");
    document.body.appendChild(root);
    for (const island of islands) {
      const world = new FrWorld(island, new FrTerrainData(this.terrainFile), this.backend);
      await world.load();
      const clock = new FrClockSync(this.backend, island, this.uid);
      clock.state = (await this.backend.get<FrClockState>("forest/" + island + "/clock")) || clock.state;
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

  private draw(): void {
    this.views.forEach((view) => { this.drawMap(view); this.drawInfo(view); });
  }

  private drawMap(view: { world: FrWorld; roster: FrRoster; canvas: HTMLCanvasElement }): void {
    const g = view.canvas.getContext("2d") as CanvasRenderingContext2D;
    const P = FrBoardPage.CELL_PIXELS, terrain = view.world.terrain;
    for (let z = 0; z < terrain.d; z++) for (let x = 0; x < terrain.w; x++) {
      g.fillStyle = FrBoardPage.TOP_COLORS[terrain.top(x, z)] || "#6FA352";
      g.fillRect(x * P, z * P, P, P);
    }
    view.world.trees.forEach((spot, index) => { if (!view.world.isFelled(index)) { g.fillStyle = "rgba(30,90,40,0.8)"; g.fillRect(spot.x * P, spot.z * P, P, P); } });
    const a = terrain.anchors;
    g.fillStyle = "#FF8C00";
    g.fillRect(a.campfire.x * P - 2, a.campfire.z * P - 2, P + 4, P + 4);
    view.roster.aliveUids().forEach((uid) => {
      const pose = view.roster.poses.get(uid), member = view.roster.members.get(uid);
      if (!pose || !member || member.adm) return;
      const px = (pose.x / FrTerrainData.BLOCK) * P, pz = (pose.z / FrTerrainData.BLOCK) * P;
      g.fillStyle = "#FFFFFF";
      g.beginPath(); g.arc(px, pz, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#D97B4F";
      g.beginPath(); g.arc(px, pz, 2.5, 0, Math.PI * 2); g.fill();
    });
  }

  private drawInfo(view: { clock: FrClockSync; roster: FrRoster; world: FrWorld; info: HTMLDivElement }): void {
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

