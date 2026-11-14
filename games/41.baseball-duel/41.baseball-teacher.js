"use strict";
class BbAbilityTable {
    static label(key) { return "<b>" + key + "</b>" + (BbAbilityTable.OLD_KEY.test(key) ? ' <small style="opacity:.7">옛 3종</small>' : ""); }
    static sum(rows, keys, empty) {
        const total = Object.assign({}, empty);
        rows.forEach((row) => keys.forEach((key) => { total[key] += AccountNumbers.count(row[key]); }));
        return total;
    }
    static cell(value, text) {
        return value === null ? { text: "-", sort: -1 } : { text: text(value), sort: value };
    }
    static batRows(groups) {
        const f = BbBaseballFormulas, rate = f.rateText, pct = (value) => (value * 100).toFixed(1) + "%";
        return Object.keys(groups).map((key) => {
            const s = BbAbilityTable.sum(groups[key], ["g"].concat(BbStatsKeys.BAT), Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyBat()));
            const c = BbAbilityTable.cell;
            return { key, g: s.g, cells: [c(s.g, String), c(s.pa, String), c(f.average(s), rate), c(f.onBase(s), rate), c(f.slugging(s), rate), c(f.ops(s), rate), c(f.perPlate(s.hr, s), pct), c(f.perPlate(s.k, s), pct), c(f.perPlate(s.bb, s), pct)] };
        });
    }
    static pitRows(groups) {
        const f = BbBaseballFormulas, pct = (value) => (value * 100).toFixed(1) + "%";
        return Object.keys(groups).map((key) => {
            const s = BbAbilityTable.sum(groups[key], ["g"].concat(BbStatsKeys.PIT), Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyPit()));
            const c = BbAbilityTable.cell;
            return { key, g: s.g, cells: [c(s.g, String), c(s.bf, String), c(f.ops(s), f.rateText), c(f.earnedRunAverage(s), f.meanText), c(f.whip(s), f.meanText), c(f.perBatter(s.k, s), pct), c(f.perBatter(s.bb, s), pct)] };
        });
    }
    static html(head, rows, sortColumn, kind) {
        const sorted = rows.slice().sort((a, b) => (sortColumn < 0 ? a.key.localeCompare(b.key) : b.cells[sortColumn].sort - a.cells[sortColumn].sort));
        return '<table class="asd-table bb-ability-table"><thead><tr>' + head.map((label, index) => '<th data-bb-sort="' + kind + ":" + (index - 1) + '" style="cursor:pointer">' + label + "</th>").join("") + "</tr></thead><tbody>"
            + sorted.map((row) => '<tr style="' + (row.g < BbAbilityTable.FEW_GAMES ? "opacity:.45" : "") + '"><td>' + BbAbilityTable.label(row.key) + "</td>" + row.cells.map((cell) => "<td>" + cell.text + "</td>").join("") + "</tr>").join("")
            + "</tbody></table>";
    }
}
BbAbilityTable.FEW_GAMES = 5;
BbAbilityTable.BAT_HEAD = ["컨택-파워-주루-수비", "게임", "타석", "타율", "출루율", "장타율", "OPS", "홈런율", "삼진율", "볼넷율"];
BbAbilityTable.PIT_HEAD = ["제구-구위-변화-체력", "게임", "상대 타자", "피OPS", "평균자책점", "WHIP", "삼진률", "볼넷율"];
BbAbilityTable.OLD_KEY = /^[1-7]-[1-7]-[1-7]$/;
class BbTeacherPanel {
    constructor(io, body, toggle) {
        this.io = io;
        this.body = body;
        this.toggle = toggle;
        this.opened = false;
        this.batRows = [];
        this.pitRows = [];
        this.batSort = 0;
        this.pitSort = 0;
    }
    bind() {
        this.toggle.addEventListener("click", () => {
            const open = this.body.hidden;
            this.body.hidden = !open;
            this.toggle.textContent = open ? "접기" : "펼치기";
            if (open && !this.opened) {
                this.opened = true;
                this.build();
            }
        });
    }
    part(selector) { return this.body.querySelector(selector); }
    build() {
        this.body.innerHTML = '<p class="hint">41번 야구 1대1 대전. <b>핫콜드존</b>을 켜면 경기 중 투수에게 상대 타자의 구역별 타율이, 타자에게 상대 투수가 많이 던지는 위치가 보입니다(기본 꺼짐). '
            + "<b>포인트별 성적</b>은 학생이 고른 능력치 배분별로 사람과 한 경기 기록을 합쳐 보여 줍니다(학생 화면에는 없음). 5경기 미만인 줄은 흐리게, 머리글을 누르면 정렬합니다.</p>"
            + '<div class="actions"><button type="button" data-bb-zones>핫콜드존: 읽는 중…</button><button type="button" data-bb-load>포인트별 성적 불러오기</button></div><p class="msg" data-bb-msg></p><div data-bb-tables class="stats-box"></div>';
        this.part("[data-bb-zones]").addEventListener("click", () => { this.flipZones(); });
        this.part("[data-bb-load]").addEventListener("click", () => { this.load(); });
        this.part("[data-bb-tables]").addEventListener("click", (event) => {
            const target = event.target.closest("[data-bb-sort]");
            if (!target)
                return;
            const [kind, column] = String(target.getAttribute("data-bb-sort")).split(":");
            if (kind === "bat")
                this.batSort = Number(column);
            else
                this.pitSort = Number(column);
            this.draw();
        });
        this.readZones();
    }
    say(text) { this.part("[data-bb-msg]").textContent = text; }
    async readZones() {
        const button = this.part("[data-bb-zones]");
        try {
            const on = (await this.io.read(BbZoneSwitch.PATH)) === true;
            button.dataset.on = on ? "1" : "0";
            button.textContent = "핫콜드존: " + (on ? "켜짐 (누르면 끔)" : "꺼짐 (누르면 켬)");
        }
        catch (error) {
            button.textContent = "핫콜드존: 읽지 못함";
        }
    }
    async flipZones() {
        const button = this.part("[data-bb-zones]"), next = button.dataset.on !== "1";
        try {
            await this.io.patch({ [BbZoneSwitch.PATH]: next });
            await this.readZones();
            this.say("핫콜드존을 " + (next ? "켰어요. 학생이 게임을 다시 열면 적용됩니다." : "껐어요."));
        }
        catch (error) {
            this.say("바꾸지 못했어요. (데이터베이스 규칙 게시 여부를 확인해 주세요)");
        }
    }
    async load() {
        this.say("불러오는 중…");
        try {
            const board = AccountShape.slots(await this.io.read(BbBoardRow.ROOT)), uids = Object.keys(board);
            const nodes = await Promise.all(uids.map((uid) => this.io.read("users/" + uid + "/stats/" + BbStatsKeys.GAME).then((raw) => BbStatsMath.normalize(raw)).catch(() => null)));
            const bat = {}, pit = {};
            nodes.forEach((node) => {
                if (!node)
                    return;
                Object.keys(node.ab).forEach((key) => { (bat[key] = bat[key] || []).push(node.ab[key]); });
                Object.keys(node.ap).forEach((key) => { (pit[key] = pit[key] || []).push(node.ap[key]); });
            });
            this.batRows = BbAbilityTable.batRows(bat);
            this.pitRows = BbAbilityTable.pitRows(pit);
            this.say("학생 " + uids.length + "명의 기록을 합쳤어요.");
            this.draw();
        }
        catch (error) {
            this.say("불러오지 못했어요.");
        }
    }
    draw() {
        this.part("[data-bb-tables]").innerHTML = '<div class="asd-sec">타자 (' + this.batRows.length + "가지 배분)</div>" + BbAbilityTable.html(BbAbilityTable.BAT_HEAD, this.batRows, this.batSort, "bat")
            + '<div class="asd-sec">투수 (' + this.pitRows.length + "가지 배분)</div>" + BbAbilityTable.html(BbAbilityTable.PIT_HEAD, this.pitRows, this.pitSort, "pit");
    }
}
