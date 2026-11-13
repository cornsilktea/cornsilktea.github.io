"use strict";
class BbHudParts {
    static box(className, parent, text = "") {
        const element = document.createElement("div");
        element.className = className;
        element.textContent = text;
        parent.appendChild(element);
        return element;
    }
    static shape(tag, className, parent, attributes = {}) {
        const element = document.createElementNS(BbHudParts.SVG_SPACE, tag);
        element.setAttribute("class", className);
        Object.keys(attributes).forEach((name) => element.setAttribute(name, String(attributes[name])));
        parent.appendChild(element);
        return element;
    }
}
BbHudParts.SVG_SPACE = "http://www.w3.org/2000/svg";
class BbRunnerDiamond {
    constructor(host) {
        this.lit = [false, false, false];
        this.seen = [false, false, false, false];
        const edge = BbRunnerDiamond.EDGE, home = BbFieldGeometry.HOME, half = BbRunnerDiamond.BAG_HALF;
        const picture = BbHudParts.shape("svg", "bb-diamond", host, { viewBox: [edge.left, edge.top, edge.right - edge.left, edge.bottom - edge.top].join(" ") });
        const corners = [home].concat(BbRunnerDiamond.BAGS), gaps = [half * 0.6, half, half, half];
        corners.forEach((corner, index) => {
            const next = corners[(index + 1) % corners.length], along = next.minus(corner).unit();
            const from = corner.plus(along.times(gaps[index])), to = next.minus(along.times(gaps[(index + 1) % corners.length]));
            BbHudParts.shape("line", "bb-diamond-line", picture, { x1: from.x.toFixed(2), y1: from.z.toFixed(2), x2: to.x.toFixed(2), y2: to.z.toFixed(2) });
        });
        BbHudParts.shape("rect", "bb-diamond-home", picture, { x: -half * 0.6, y: -half * 0.6, width: half * 1.2, height: half * 1.2, transform: "rotate(45)" });
        this.bags = BbRunnerDiamond.BAGS.map((bag) => BbHudParts.shape("rect", "bb-diamond-bag", picture, { x: -half, y: -half, width: half * 2, height: half * 2, transform: "translate(" + bag.x + " " + bag.z + ") rotate(45)" }));
        this.dots = BbRunnerDiamond.ROLES.map(() => BbHudParts.shape("circle", "bb-diamond-runner", picture, { r: BbRunnerDiamond.DOT_RADIUS }));
    }
    follow(script, tracks, seconds) {
        const edge = BbRunnerDiamond.EDGE, occupied = [false, false, false];
        BbRunnerDiamond.ROLES.forEach((role, index) => {
            const running = tracks.some((track) => track.role === role && seconds >= track.since && seconds < track.until), dot = this.dots[index];
            if (running !== this.seen[index]) {
                this.seen[index] = running;
                dot.style.opacity = running ? "1" : "0";
            }
            if (!running)
                return;
            const spot = script.placementOf(role, seconds).position;
            dot.style.transform = "translate(" + BbCurve.clamp(spot.x, edge.left + 3, edge.right - 3).toFixed(2) + "px," + BbCurve.clamp(spot.z, edge.top + 3, edge.bottom - 3).toFixed(2) + "px)";
            BbRunnerDiamond.BAGS.forEach((bag, base) => { if (spot.distanceTo(bag) < BbRunnerDiamond.ON_BAG_METERS)
                occupied[base] = true; });
        });
        occupied.forEach((on, base) => {
            if (on === this.lit[base])
                return;
            this.lit[base] = on;
            this.bags[base].classList.toggle("on", on);
        });
    }
}
BbRunnerDiamond.ROLES = ["batter", "runnerFirst", "runnerSecond", "runnerThird"];
BbRunnerDiamond.BAGS = [BbFieldGeometry.FIRST, BbFieldGeometry.SECOND, BbFieldGeometry.THIRD];
BbRunnerDiamond.BAG_HALF = 4.2;
BbRunnerDiamond.DOT_RADIUS = 3.6;
BbRunnerDiamond.ON_BAG_METERS = 2.9;
BbRunnerDiamond.EDGE = { left: -26, right: 26, top: -44, bottom: 5 };
class BbCountLamps {
    constructor(host) {
        const table = BbHudParts.box("bb-count", host);
        this.lamps = BbCountLamps.ROWS.map(([letter, count, kind]) => {
            const row = BbHudParts.box("bb-count-row", table);
            BbHudParts.box("bb-count-letter", row, letter);
            return Array.from({ length: count }, () => BbHudParts.box("bb-lamp bb-lamp-" + kind, row));
        });
    }
    show(balls, strikes, outs) {
        [balls, strikes, outs].forEach((value, row) => this.lamps[row].forEach((lamp, index) => lamp.classList.toggle("on", index < value)));
    }
}
BbCountLamps.ROWS = [["B", 3, "ball"], ["S", 2, "strike"], ["O", 2, "out"]];
class BbBoardTicker {
    constructor(hud) {
        this.hud = hud;
        this.shown = { inning: 1, half: 0, outs: 0, balls: 0, strikes: 0, score: [0, 0], pitches: 0 };
    }
    begin(board) {
        this.shown = { ...board, score: [board.score[0], board.score[1]] };
        this.hud.show(this.shown);
    }
    thrown(countEnds) {
        this.shown.pitches++;
        if (countEnds)
            this.shown.balls = this.shown.strikes = 0;
        this.hud.show(this.shown);
    }
    settle(final) {
        if (this.sameHalf(final) && final.outs >= this.shown.outs)
            this.begin({ ...final, pitches: this.shown.pitches });
        else
            this.begin({ ...this.shown, score: final.score, outs: 3 });
    }
    tally(kind, final) {
        const shown = this.shown;
        if (kind === "settle") {
            this.settle(final);
            return;
        }
        if (kind === "out")
            shown.outs = Math.min(shown.outs + 1, 3);
        else
            shown.score[shown.half] = Math.min(shown.score[shown.half] + 1, final.score[shown.half]);
        this.hud.show(shown);
    }
    sameHalf(final) { return final.inning === this.shown.inning && final.half === this.shown.half; }
}
class BbScoreHud {
    constructor(host) {
        const box = BbHudParts.box("hud-box bb-score", host);
        this.inning = BbHudParts.box("bb-score-inning", box);
        const teams = BbHudParts.box("bb-score-teams", box);
        this.rows = [0, 1].map(() => BbHudParts.box("bb-score-row", teams));
        this.names = this.rows.map((row) => BbHudParts.box("bb-score-name", row));
        this.runs = this.rows.map((row) => BbHudParts.box("bb-score-runs", row, "0"));
        this.diamond = new BbRunnerDiamond(box);
        this.lamps = new BbCountLamps(box);
        this.pitchCount = BbHudParts.box("bb-score-pitches", box);
        this.roomCode = BbHudParts.box("room-code-tag", box);
        this.roomCode.id = "hudRoomCode";
    }
    players(guest, host) { [guest, host].forEach((name, team) => { this.names[team].textContent = name; }); }
    room(code) { this.roomCode.textContent = code ? "방 코드 " + code : ""; }
    show(board) {
        this.inning.textContent = board.inning + "회";
        this.runs.forEach((cell, team) => { cell.textContent = String(board.score[team]); });
        this.rows.forEach((row, team) => row.classList.toggle("batting", team === board.half));
        this.lamps.show(board.balls, board.strikes, board.outs);
        this.pitchCount.textContent = "투구 " + board.pitches;
    }
    follow(script, tracks, seconds) { this.diamond.follow(script, tracks, seconds); }
}
