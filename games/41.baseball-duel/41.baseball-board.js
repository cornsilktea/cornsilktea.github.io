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
    top(entries, limit) {
        return entries.map((entry) => ({ entry, value: this.value(entry) })).filter((row) => row.value !== null && row.entry.g > 0)
            .sort((a, b) => (this.lower ? a.value - b.value : b.value - a.value) || a.entry.n.localeCompare(b.entry.n)).slice(0, limit);
    }
}
BbBoardStat.MIN_PLATE = 10;
BbBoardStat.MIN_OUTS = 9;
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
    new BbBoardStat("게임 수", (e) => e.g, BbBoardCatalog.WHOLE, false, "bat", false),
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
    new BbBoardStat("게임 수", (e) => e.g, BbBoardCatalog.WHOLE, false, "pit", false),
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
class BbBoardPanel {
    constructor(mount, backend, myClass) {
        this.backend = backend;
        this.myClass = myClass;
        this.entries = [];
        this.side = "bat";
        this.statIndex = 3;
        this.loaded = false;
        this.loading = false;
        this.mineOnly = !!myClass;
        BbHudParts.box("bb-board-title", mount, "기록 순위");
        const toggles = BbHudParts.box("bb-board-toggles", mount);
        this.sideButtons = ["bat", "pit"].map((side) => BbSheetParts.button("bb-room-chip", toggles, side === "bat" ? "타자" : "투수", () => { this.side = side; this.statIndex = side === "bat" ? 3 : 2; this.draw(); }));
        this.scopeButtons = [true, false].map((mine) => BbSheetParts.button("bb-room-chip", toggles, mine ? "우리 반" : "전체", () => { this.mineOnly = mine; this.draw(); }));
        BbSheetParts.button("bb-room-chip", toggles, "새로고침", () => { this.loaded = false; this.load(); });
        this.statRow = BbHudParts.box("bb-board-stats", mount);
        this.list = BbHudParts.box("bb-board-list", mount);
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
    draw() {
        const stats = BbBoardCatalog.of(this.side), stat = stats[this.statIndex] || stats[0];
        this.sideButtons.forEach((button, index) => button.classList.toggle("on", (index === 0) === (this.side === "bat")));
        this.scopeButtons.forEach((button, index) => { button.classList.toggle("on", (index === 0) === this.mineOnly); button.disabled = index === 0 && !this.myClass; });
        this.statRow.textContent = "";
        stats.forEach((item, index) => BbSheetParts.button("bb-board-stat" + (item === stat ? " on" : ""), this.statRow, item.label, () => { this.statIndex = index; this.draw(); }));
        this.list.textContent = "";
        if (!this.loaded)
            return;
        const pool = this.mineOnly && this.myClass ? this.entries.filter((entry) => entry.c === this.myClass) : this.entries, rows = stat.top(pool, BbBoardPanel.LIMIT);
        rows.forEach((row, index) => {
            const line = BbHudParts.box("bb-board-row", this.list);
            BbHudParts.box("bb-board-rank", line, String(index + 1));
            BbHudParts.box("bb-board-name", line, row.entry.n + (this.mineOnly ? "" : row.entry.c !== "none" ? " · " + row.entry.c.replace("-", "학년 ") + "반" : ""));
            BbHudParts.box("bb-board-value", line, stat.text(row.value));
        });
        this.say(rows.length ? (stat.lower ? "낮을수록 위" : "높을수록 위") + (stat.qualifies({ uid: "", n: "", c: "", g: 0, bat: BbBoxScoreBuilder.emptyBat(), pit: BbBoxScoreBuilder.emptyPit() }) ? "" : this.side === "bat" ? " · 10타석 이상만" : " · 3이닝 이상만") : "아직 기록이 없어요.");
    }
}
BbBoardPanel.LIMIT = 10;
