"use strict";
class BbBoardStat {
    constructor(label, pick, write, lower, side, rate) {
        this.label = label;
        this.pick = pick;
        this.write = write;
        this.lower = lower;
        this.side = side;
        this.rate = rate;
    }
    qualifies(entry) {
        if (!this.rate)
            return true;
        return this.side === "bat" ? entry.bat.pa >= BbBoardStat.MIN_PLATE : entry.pit.outs >= BbBoardStat.MIN_OUTS;
    }
    value(entry) { return this.qualifies(entry) ? this.pick(entry) : null; }
    text(value) { return this.write(value); }
    cell(entry) {
        const value = this.pick(entry);
        return value !== null && Number.isFinite(value) ? this.write(value) : BbBoardStat.EMPTY;
    }
    top(entries, limit) {
        return entries.map((entry) => ({ entry, value: this.value(entry) })).filter((row) => row.value !== null && Number.isFinite(row.value) && row.entry.g > 0)
            .sort((a, b) => (this.lower ? a.value - b.value : b.value - a.value) || a.entry.n.localeCompare(b.entry.n)).slice(0, limit);
    }
}
BbBoardStat.MIN_PLATE = 10;
BbBoardStat.MIN_OUTS = 9;
BbBoardStat.EMPTY = "-";
class BbBoardCatalog {
    static of(side) { return side === "bat" ? BbBoardCatalog.BAT : BbBoardCatalog.PIT; }
    static entries(raw) {
        const slots = AccountShape.slots(raw);
        return Object.keys(slots).map((uid) => {
            const row = slots[uid];
            return {
                uid, n: String(row && row.n || "학생"), c: String(row && row.c || "none"), g: AccountNumbers.count(row && row.g),
                bat: BbStatsMath.counts(row && row.bat, BbStatsKeys.BAT, BbBoxScoreBuilder.emptyBat()), pit: BbStatsMath.counts(row && row.pit, BbStatsKeys.PIT, BbBoxScoreBuilder.emptyPit())
            };
        });
    }
}
BbBoardCatalog.f = BbBaseballFormulas;
BbBoardCatalog.WHOLE = (value) => String(Math.round(value));
BbBoardCatalog.RATE = (value) => BbBaseballFormulas.rateText(value);
BbBoardCatalog.MEAN = (value) => BbBaseballFormulas.meanText(value);
BbBoardCatalog.PERCENT = (value) => (value * 100).toFixed(1) + "%";
BbBoardCatalog.INNINGS = (value) => Math.floor(value / 3) + "." + value % 3;
BbBoardCatalog.BAT = [
    new BbBoardStat("경기", (e) => e.g, BbBoardCatalog.WHOLE, false, "bat", false),
    new BbBoardStat("타석", (e) => e.bat.pa, BbBoardCatalog.WHOLE, false, "bat", false),
    new BbBoardStat("타수", (e) => e.bat.ab, BbBoardCatalog.WHOLE, false, "bat", false),
    new BbBoardStat("타율", (e) => BbBoardCatalog.f.average(e.bat), BbBoardCatalog.RATE, false, "bat", true),
    new BbBoardStat("출루율", (e) => BbBoardCatalog.f.onBase(e.bat), BbBoardCatalog.RATE, false, "bat", true),
    new BbBoardStat("장타율", (e) => BbBoardCatalog.f.slugging(e.bat), BbBoardCatalog.RATE, false, "bat", true),
    new BbBoardStat("OPS", (e) => BbBoardCatalog.f.ops(e.bat), BbBoardCatalog.RATE, false, "bat", true),
    new BbBoardStat("득점", (e) => e.bat.r, BbBoardCatalog.WHOLE, false, "bat", false),
    new BbBoardStat("홈런", (e) => e.bat.hr, BbBoardCatalog.WHOLE, false, "bat", false),
    new BbBoardStat("홈런율", (e) => BbBoardCatalog.f.perPlate(e.bat.hr, e.bat), BbBoardCatalog.PERCENT, false, "bat", true),
    new BbBoardStat("삼진", (e) => e.bat.k, BbBoardCatalog.WHOLE, false, "bat", false),
    new BbBoardStat("삼진율", (e) => BbBoardCatalog.f.perPlate(e.bat.k, e.bat), BbBoardCatalog.PERCENT, true, "bat", true),
    new BbBoardStat("볼넷", (e) => e.bat.bb, BbBoardCatalog.WHOLE, false, "bat", false),
    new BbBoardStat("볼넷율", (e) => BbBoardCatalog.f.perPlate(e.bat.bb, e.bat), BbBoardCatalog.PERCENT, false, "bat", true)
];
BbBoardCatalog.PIT = [
    new BbBoardStat("경기", (e) => e.g, BbBoardCatalog.WHOLE, false, "pit", false),
    new BbBoardStat("이닝", (e) => e.pit.outs, BbBoardCatalog.INNINGS, false, "pit", false),
    new BbBoardStat("평균자책점", (e) => BbBoardCatalog.f.earnedRunAverage(e.pit), BbBoardCatalog.MEAN, true, "pit", true),
    new BbBoardStat("WHIP", (e) => BbBoardCatalog.f.whip(e.pit), BbBoardCatalog.MEAN, true, "pit", true),
    new BbBoardStat("삼진", (e) => e.pit.k, BbBoardCatalog.WHOLE, false, "pit", false),
    new BbBoardStat("삼진률", (e) => BbBoardCatalog.f.perBatter(e.pit.k, e.pit), BbBoardCatalog.PERCENT, false, "pit", true),
    new BbBoardStat("볼넷", (e) => e.pit.bb, BbBoardCatalog.WHOLE, true, "pit", false),
    new BbBoardStat("볼넷율", (e) => BbBoardCatalog.f.perBatter(e.pit.bb, e.pit), BbBoardCatalog.PERCENT, true, "pit", true),
    new BbBoardStat("피홈런", (e) => e.pit.hr, BbBoardCatalog.WHOLE, true, "pit", false),
    new BbBoardStat("피홈런율", (e) => BbBoardCatalog.f.perBatter(e.pit.hr, e.pit), BbBoardCatalog.PERCENT, true, "pit", true),
    new BbBoardStat("피OPS", (e) => BbBoardCatalog.f.ops(e.pit), BbBoardCatalog.RATE, true, "pit", true)
];
class BbZoneSwitch {
    constructor() {
        this.on = false;
    }
    load(backend) {
        const database = backend.database;
        if (!database)
            return;
        database.ref(BbZoneSwitch.PATH).once("value").then((snapshot) => { this.on = snapshot.val() === true; }).catch(() => undefined);
    }
}
BbZoneSwitch.PATH = "baseballduel/settings/zones";
class BbBoardTable {
    constructor(mount, onSort) {
        this.onSort = onSort;
        this.scroller = BbHudParts.box("bb-board-scroll", mount);
    }
    draw(view) {
        const table = document.createElement("table"), head = table.createTHead().insertRow(), body = table.createTBody();
        table.className = "bb-board-table";
        BbBoardTable.cell(head, "th", "순위", "bb-board-rank");
        BbBoardTable.cell(head, "th", "이름", "bb-board-name");
        view.stats.forEach((stat, index) => {
            const th = BbBoardTable.cell(head, "th", "", "bb-board-sort" + (index === view.sortIndex ? " on" : ""));
            BbSheetParts.button("bb-board-head", th, stat.label + (index === view.sortIndex ? " ▼" : ""), () => this.onSort(index));
        });
        view.rows.forEach((row, rank) => {
            const line = body.insertRow();
            BbBoardTable.cell(line, "td", String(rank + 1), "bb-board-rank");
            BbBoardTable.cell(line, "td", (view.showClass ? BbBoardTable.classLabel(row.entry.c) : "") + row.entry.n, "bb-board-name");
            view.stats.forEach((stat, index) => BbBoardTable.cell(line, "td", stat.cell(row.entry), index === view.sortIndex ? "on" : ""));
        });
        this.scroller.textContent = "";
        if (view.rows.length)
            this.scroller.appendChild(table);
    }
    clear() { this.scroller.textContent = ""; }
    static classLabel(id) { return id !== "none" ? id + " " : ""; }
    static cell(row, tag, text, className) {
        const cell = document.createElement(tag);
        cell.className = className;
        cell.textContent = text;
        row.appendChild(cell);
        return cell;
    }
}
class BbBoardPanel {
    constructor(mount, backend, myClass) {
        this.mount = mount;
        this.backend = backend;
        this.myClass = myClass;
        this.full = false;
        this.entries = [];
        this.side = "bat";
        this.statIndex = 3;
        this.loaded = false;
        this.loading = false;
        this.mineOnly = !!myClass;
        const head = BbHudParts.box("bb-board-headline", mount);
        BbHudParts.box("bb-board-title", head, "기록 순위");
        this.sizeButton = BbSheetParts.button("bb-board-size", head, BbBoardPanel.ENLARGE, () => this.setFull(!this.full));
        document.addEventListener("keydown", (event) => { if (event.key === "Escape" && this.full)
            this.setFull(false); });
        const toggles = BbHudParts.box("bb-board-toggles", mount);
        this.sideButtons = ["bat", "pit"].map((side) => BbSheetParts.button("bb-room-chip", toggles, side === "bat" ? "타자" : "투수", () => { this.side = side; this.statIndex = side === "bat" ? 3 : 2; this.draw(); }));
        this.scopeButtons = [true, false].map((mine) => BbSheetParts.button("bb-room-chip", toggles, mine ? "우리 반" : "전체", () => { this.mineOnly = mine; this.draw(); }));
        BbSheetParts.button("bb-room-chip", toggles, "새로고침", () => { this.loaded = false; this.load(); });
        this.table = new BbBoardTable(mount, (index) => { this.statIndex = index; this.draw(); });
        this.note = BbHudParts.box("bb-board-note", mount);
        this.draw();
    }
    load() {
        const database = this.backend.database;
        if (this.loaded || this.loading || !database) {
            if (!database)
                this.say("서버에 연결하지 못해 순위를 볼 수 없어요.");
            return;
        }
        this.loading = true;
        this.say("불러오는 중…");
        database.ref(BbBoardRow.ROOT).once("value").then((snapshot) => {
            this.entries = BbBoardCatalog.entries(snapshot.val());
            this.loaded = true;
            this.draw();
        }).catch(() => this.say("순위를 불러오지 못했어요.")).then(() => { this.loading = false; });
    }
    say(text) { this.note.textContent = text; }
    setFull(on) {
        this.full = on;
        this.mount.classList.toggle("bb-board-full", on);
        const screen = this.mount.closest(".st-screen");
        if (screen)
            screen.classList.toggle("bb-board-raised", on);
        this.sizeButton.textContent = on ? BbBoardPanel.CLOSE : BbBoardPanel.ENLARGE;
        this.sizeButton.classList.toggle("close", on);
    }
    draw() {
        const stats = BbBoardCatalog.of(this.side), sortIndex = stats[this.statIndex] ? this.statIndex : 0, stat = stats[sortIndex];
        this.sideButtons.forEach((button, index) => button.classList.toggle("on", (index === 0) === (this.side === "bat")));
        this.scopeButtons.forEach((button, index) => { button.classList.toggle("on", (index === 0) === this.mineOnly); button.disabled = index === 0 && !this.myClass; });
        if (!this.loaded) {
            this.table.clear();
            return;
        }
        const mine = this.mineOnly && !!this.myClass, pool = mine ? this.entries.filter((entry) => entry.c === this.myClass) : this.entries;
        const rows = stat.top(pool, mine ? pool.length : BbBoardPanel.LIMIT);
        this.table.draw({ stats, sortIndex, rows, showClass: !mine });
        const order = stat.lower ? "낮을수록 위" : "높을수록 위", floor = stat.qualifies(BbBoardPanel.BLANK) ? "" : this.side === "bat" ? " · 10타석 이상만" : " · 3이닝 이상만";
        this.say(rows.length ? stat.label + " " + order + floor + (mine ? "" : " · 상위 " + BbBoardPanel.LIMIT + "명") : "아직 기록이 없어요.");
    }
}
BbBoardPanel.LIMIT = 30;
BbBoardPanel.ENLARGE = "확대";
BbBoardPanel.CLOSE = "닫기";
BbBoardPanel.BLANK = { uid: "", n: "", c: "", g: 0, bat: BbBoxScoreBuilder.emptyBat(), pit: BbBoxScoreBuilder.emptyPit() };
