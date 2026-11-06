"use strict";
class TeamDom {
    static byId(id) {
        const element = document.getElementById(id);
        if (!element)
            throw new Error(`#${id} 요소가 없어요`);
        return element;
    }
    static create(tag, className, text = "") {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = text;
        return element;
    }
}
class TeamShuffler {
    shuffle(items) {
        const shuffled = [...items];
        for (let last = shuffled.length - 1; last > 0; last--) {
            const pick = Math.floor(Math.random() * (last + 1));
            [shuffled[last], shuffled[pick]] = [shuffled[pick], shuffled[last]];
        }
        return shuffled;
    }
}
class TeamSplitter {
    constructor(shuffler) {
        this.shuffler = shuffler;
    }
    split(numbers, membersPerTeam) {
        if (numbers.length === 0)
            return [];
        const teamCount = this.teamCount(numbers.length, membersPerTeam);
        const mixed = this.shuffler.shuffle(numbers);
        const baseSize = Math.floor(mixed.length / teamCount);
        const biggerTeams = mixed.length % teamCount;
        const teams = [];
        let start = 0;
        for (let index = 0; index < teamCount; index++) {
            const size = baseSize + (index < biggerTeams ? 1 : 0);
            teams.push(mixed.slice(start, start + size).sort((a, b) => a - b));
            start += size;
        }
        return teams;
    }
    teamCount(studentCount, membersPerTeam) {
        let teamCount = Math.max(1, Math.ceil(studentCount / membersPerTeam));
        while (teamCount > 1 && Math.floor(studentCount / teamCount) < TeamSplitter.MIN_MEMBERS)
            teamCount--;
        return teamCount;
    }
}
TeamSplitter.MIN_MEMBERS = 2;
class TeamSizePicker {
    constructor(container) {
        this.current = TeamSizePicker.DEFAULT_SIZE;
        this.buttons = new Map();
        TeamSizePicker.SIZES.forEach((size) => {
            const button = TeamDom.create("button", "size-button", `${size}명`);
            button.type = "button";
            button.addEventListener("click", () => this.select(size));
            this.buttons.set(size, button);
            container.appendChild(button);
        });
        this.paint();
    }
    value() {
        return this.current;
    }
    select(size) {
        this.current = size;
        this.paint();
    }
    paint() {
        this.buttons.forEach((button, size) => {
            const on = size === this.current;
            button.classList.toggle("on", on);
            button.setAttribute("aria-pressed", String(on));
        });
    }
}
TeamSizePicker.SIZES = [2, 3, 4, 5, 6];
TeamSizePicker.DEFAULT_SIZE = 3;
class TeamNumberPicker {
    constructor(container) {
        this.excluded = new Set();
        this.changeListener = () => undefined;
        const buttons = this.allNumbers().map((number) => this.buildButton(number));
        [0, 1].forEach((rowIndex) => {
            const row = TeamDom.create("div", "number-row");
            row.append(...buttons.slice(rowIndex * TeamNumberPicker.PER_ROW, (rowIndex + 1) * TeamNumberPicker.PER_ROW));
            container.appendChild(row);
        });
    }
    onChange(listener) {
        this.changeListener = listener;
    }
    presentNumbers() {
        return this.allNumbers().filter((number) => !this.excluded.has(number));
    }
    allNumbers() {
        return Array.from({ length: TeamNumberPicker.COUNT }, (_, index) => index + 1);
    }
    buildButton(number) {
        const button = TeamDom.create("button", "number-button", String(number));
        button.type = "button";
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => this.toggle(number, button));
        return button;
    }
    toggle(number, button) {
        const nowAbsent = !this.excluded.has(number);
        if (nowAbsent)
            this.excluded.add(number);
        else
            this.excluded.delete(number);
        button.classList.toggle("off", nowAbsent);
        button.setAttribute("aria-pressed", String(nowAbsent));
        this.changeListener();
    }
}
TeamNumberPicker.COUNT = 30;
TeamNumberPicker.PER_ROW = 15;
class TeamBoardView {
    constructor(board) {
        this.board = board;
    }
    showHint(text) {
        this.board.textContent = "";
        this.board.appendChild(TeamDom.create("p", "board-hint", text));
    }
    showTeams(teams) {
        this.board.textContent = "";
        this.fitGrid(teams.length);
        teams.forEach((members, index) => this.board.appendChild(this.buildCard(index + 1, members)));
    }
    fitGrid(teamCount) {
        const aspect = this.board.clientWidth / Math.max(1, this.board.clientHeight);
        const columns = Math.max(1, Math.min(teamCount, Math.round(Math.sqrt(teamCount * aspect / TeamBoardView.CARD_ASPECT))));
        this.board.style.setProperty("--cols", String(columns));
        this.board.style.setProperty("--rows", String(Math.ceil(teamCount / columns)));
    }
    buildCard(teamNumber, members) {
        const card = TeamDom.create("section", "team-card");
        card.style.animationDelay = `${(teamNumber - 1) * 40}ms`;
        card.appendChild(TeamDom.create("h2", "team-title", `${teamNumber}조`));
        const list = TeamDom.create("div", "team-members");
        members.forEach((member) => list.appendChild(TeamDom.create("span", "member-chip", String(member))));
        card.appendChild(list);
        return card;
    }
}
TeamBoardView.CARD_ASPECT = 1.3;
class TeamPickerApp {
    constructor() {
        this.sizes = new TeamSizePicker(TeamDom.byId("sizeChoice"));
        this.numbers = new TeamNumberPicker(TeamDom.byId("numberPicker"));
        this.view = new TeamBoardView(TeamDom.byId("teamBoard"));
        this.splitter = new TeamSplitter(new TeamShuffler());
        this.presentCount = TeamDom.byId("presentCount");
        TeamDom.byId("placeButton").addEventListener("click", () => this.place());
        this.numbers.onChange(() => this.showPresentCount());
        this.showPresentCount();
        this.view.showHint("조원 수를 고르고 배치를 눌러 주세요.");
    }
    place() {
        const present = this.numbers.presentNumbers();
        if (present.length === 0) {
            this.view.showHint("출석한 번호가 없어요. 아래에서 번호를 다시 켜 주세요.");
            return;
        }
        this.view.showTeams(this.splitter.split(present, this.sizes.value()));
    }
    showPresentCount() {
        this.presentCount.textContent = `${this.numbers.presentNumbers().length}명`;
    }
}
new TeamPickerApp();
