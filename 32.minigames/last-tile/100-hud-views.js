"use strict";
class FloorLabel {
    constructor(outLabel) {
        this.outLabel = outLabel;
    }
    grounded(floor) { return (floor + 1) + "층"; }
    falling() { return "낙하"; }
    out() { return this.outLabel; }
}
class FloorCensus {
    constructor() {
        this.perFloor = new Map();
        this.fallingCount = 0;
    }
    grounded(floor) { this.perFloor.set(floor, (this.perFloor.get(floor) || 0) + 1); }
    falling() { this.fallingCount++; }
    out() { return; }
    summary() {
        const parts = [];
        for (let floor = LastTileRules.FLOOR_COUNT - 1; floor >= 0; floor--) {
            const count = this.perFloor.get(floor);
            if (count)
                parts.push((floor + 1) + "층 " + count + "명");
        }
        if (this.fallingCount)
            parts.push("낙하 " + this.fallingCount + "명");
        return parts.join(" · ");
    }
}
class HudView {
    constructor(page) {
        this.page = page;
        this.players = page.byId("hudPlayers");
        this.floors = page.byId("hudFloors");
        this.round = page.byId("hudRound");
        this.alive = page.byId("hudAlive");
        this.time = page.byId("hudTime");
        this.pushBar = page.byId("cdPush");
        this.dashBar = page.byId("cdDash");
        this.pushButtonCooldown = page.byId("btnPushCd");
        this.dashButtonCooldown = page.byId("btnDashCd");
    }
    renderRoster(match, localId, roundNumber) {
        const contestants = match.contestants();
        this.players.innerHTML = contestants.map((contestant) => this.rosterRow(match, contestant, localId)).join("");
        const census = new FloorCensus();
        contestants.forEach((contestant) => contestant.fighter.inspect(census));
        this.page.setText(this.floors, census.summary());
        this.page.setText(this.round, roundNumber + " / " + LastTileRules.TOTAL_ROUNDS + " 판");
        const alive = contestants.filter((contestant) => !contestant.fighter.isOut()).length;
        this.page.setText(this.alive, "남은 인원 " + alive + "명");
    }
    renderTimers(t, match, localId) {
        const elapsed = Math.max(0, (t - match.startAt()) / 1000);
        const waiting = !match.hasStarted(t);
        this.page.setText(this.time, waiting ? "0:00" : Math.floor(elapsed / 60) + ":" + ("0" + Math.floor(elapsed % 60)).slice(-2));
        const mine = match.contestant(localId);
        const push = mine ? mine.fighter.pushCooldownLeft(t) : 0, dash = mine ? mine.fighter.dashCooldownLeft(t) : 0;
        this.pushBar.style.transform = "scaleX(" + (1 - push) + ")";
        this.dashBar.style.transform = "scaleX(" + (1 - dash) + ")";
        this.pushButtonCooldown.style.height = push * 100 + "%";
        this.dashButtonCooldown.style.height = dash * 100 + "%";
    }
    rosterRow(match, contestant, localId) {
        const fighter = contestant.fighter;
        const outLabel = match.isOut(contestant.id) ? match.provisionalRank(contestant.id) + "위" : "탈락";
        const classes = "pl" + (contestant.id === localId ? " me" : "") + (fighter.isOut() ? " dead" : "");
        const participant = contestant.participant;
        return "<div class='" + classes + "'><i style='background:" + Palette.slotColor(participant.slot) + "'></i><b>" + Html.escape(participant.nick) + (participant.ai ? " (AI)" : "") + "</b><span>" + fighter.inspect(new FloorLabel(outLabel)) + "</span></div>";
    }
}
class MessageView {
    constructor(page) {
        this.page = page;
        this.lastBanner = "";
        this.lastCenter = "";
        this.banner = page.byId("banner");
        this.bannerBox = page.byId("bannerBox");
        this.center = page.byId("centerMsg");
        this.spectateBox = page.byId("specBox");
    }
    onSpectateNext(handler) {
        const button = this.page.byId("btnSpec");
        button.onclick = handler;
        button.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
    }
    showBanner(html, warning) {
        const key = html + warning;
        if (key === this.lastBanner)
            return;
        this.lastBanner = key;
        this.page.show(this.banner, !!html);
        this.bannerBox.innerHTML = html;
        this.bannerBox.classList.toggle("warn", warning);
    }
    showCenter(text) {
        if (text === this.lastCenter)
            return;
        this.lastCenter = text;
        this.page.show(this.center, !!text);
        this.center.textContent = text;
    }
    showSpectateButton(visible) {
        this.page.show(this.spectateBox, visible);
    }
    clear() {
        this.lastBanner = "";
        this.lastCenter = "";
        this.page.show(this.banner, false);
        this.page.show(this.center, false);
        this.page.show(this.spectateBox, false);
    }
}
class LastTileScreens {
    constructor(page, touchDevice, messages) {
        this.page = page;
        this.touchDevice = touchDevice;
        this.messages = messages;
        this.shown = "start";
        this.start = page.byId("startScreen");
        this.lobby = page.byId("lobbyScreen");
        this.result = page.byId("resultScreen");
        this.hudList = page.byId("hudList");
        this.hudRight = page.byId("hudRight");
        this.joystickZone = page.byId("joyZone");
        this.joystickBase = page.byId("joyBase");
        this.pushButton = page.byId("btnPush");
        this.dashButton = page.byId("btnDash");
    }
    get current() { return this.shown; }
    isMenuScreen() {
        return this.shown === "start" || this.shown === "lobby";
    }
    show(name) {
        this.shown = name;
        this.page.show(this.start, name === "start");
        this.page.show(this.lobby, name === "lobby");
        this.page.show(this.result, name === "result");
        const playing = name === "game";
        this.page.show(this.hudList, playing);
        this.page.show(this.hudRight, playing);
        const touchControls = playing && this.touchDevice;
        this.page.show(this.joystickZone, touchControls);
        this.page.show(this.pushButton, touchControls);
        this.page.show(this.dashButton, touchControls);
        if (!touchControls)
            this.page.show(this.joystickBase, false);
        if (!playing)
            this.messages.clear();
    }
}
