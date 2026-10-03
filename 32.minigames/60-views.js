"use strict";
class CollectionScreens {
    constructor(page, touchDevice, messages, hub) {
        this.page = page;
        this.touchDevice = touchDevice;
        this.messages = messages;
        this.hub = hub;
        this.shown = "start";
        this.start = page.byId("startScreen");
        this.lobby = page.byId("lobbyScreen");
        this.practice = page.byId("practiceScreen");
        this.result = page.byId("resultScreen");
        this.hudList = page.byId("hudList");
        this.hudRight = page.byId("hudRight");
    }
    get current() { return this.shown; }
    show(name) {
        this.shown = name;
        this.page.show(this.start, name === "start");
        this.page.show(this.lobby, name === "lobby");
        this.page.show(this.practice, name === "practice");
        this.page.show(this.result, name === "result");
        const playing = name === "game";
        this.page.show(this.hudList, playing);
        this.page.show(this.hudRight, playing);
        this.hub.showTouchControls(playing && this.touchDevice);
        if (!playing)
            this.messages.clear();
    }
}
class CollectionHud {
    constructor(page) {
        this.page = page;
        this.cooldownSignature = "";
        this.players = page.byId("hudPlayers");
        this.summary = page.byId("hudFloors");
        this.spectators = page.byId("hudSpectators");
        this.round = page.byId("hudRound");
        this.alive = page.byId("hudAlive");
        this.time = page.byId("hudTime");
        this.cooldowns = page.byId("hudCooldowns");
    }
    renderRoster(model, localId, roundLabel, spectatorNames) {
        this.players.innerHTML = model.rows.map((row) => this.rosterRow(row, localId)).join("");
        this.page.setText(this.summary, model.summary);
        this.page.setText(this.round, roundLabel);
        this.page.setText(this.alive, model.footer);
        this.page.setText(this.spectators, spectatorNames.length ? "관전 중: " + spectatorNames.join(", ") : "");
    }
    renderLive(model) {
        this.page.setText(this.time, model.clock);
        this.syncCooldownRows(model.cooldowns);
        model.cooldowns.forEach((cooldown) => {
            const bar = this.cooldowns.querySelector("i[data-action='" + cooldown.action + "']");
            if (bar)
                bar.style.transform = "scaleX(" + (1 - cooldown.left) + ")";
        });
    }
    syncCooldownRows(cooldowns) {
        const signature = cooldowns.map((cooldown) => cooldown.action).join(",");
        if (signature === this.cooldownSignature)
            return;
        this.cooldownSignature = signature;
        this.cooldowns.innerHTML = cooldowns.map((cooldown) => "<div class='cdRow'><span>" + Html.escape(cooldown.label) + "</span><div class='cdBar'><i data-action='" + cooldown.action + "'></i></div></div>").join("");
        this.page.show(this.cooldowns, cooldowns.length > 0);
    }
    rosterRow(row, localId) {
        const classes = "pl" + (row.id === localId ? " me" : "") + (row.dead ? " dead" : "");
        return "<div class='" + classes + "'><i style='background:" + Palette.slotColor(row.slot) + "'></i><b>" + Html.escape(row.nick) + (row.ai ? " (AI)" : "") + "</b><span>" + Html.escape(row.detail) + "</span></div>";
    }
}
class GameCardHtml {
    static summary(definition) {
        return "<div class='st-hint'>" + Html.escape(definition.summary) + "</div>";
    }
    static details(definition) {
        const keys = definition.keyHelp.map((help) => "<span>" + help.keys.map((key) => "<kbd>" + Html.escape(key) + "</kbd>").join(" ") + "</span><span>" + Html.escape(help.text) + "</span>").join("");
        const rules = definition.rules.map((rule) => "<li>" + rule + "</li>").join("");
        return "<h3 class='subHead'>조작 방법</h3><div class='st-keys'>" + keys + "</div><h3 class='subHead'>규칙</h3><ul class='st-rules'>" + rules + "</ul>";
    }
}
class CatalogView {
    constructor(page) {
        this.page = page;
    }
    render(catalog) {
        const host = this.page.byId("catalogHost");
        host.innerHTML = catalog.all().map((definition, index) => this.card(definition, index + 1)).join("");
        FoldCard.bindAll(host);
    }
    card(definition, order) {
        return "<div class='st-card st-fold'><h2>종목 " + order + " · " + Html.escape(definition.title) + "</h2>" + GameCardHtml.summary(definition) + GameCardHtml.details(definition) + "</div>";
    }
}
class PracticeEntryView {
    constructor(page) {
        this.button = page.byId("btnPractice");
    }
    onClick(handler) { this.button.onclick = handler; }
    setEnabled(enabled) { this.button.disabled = !enabled; }
}
class PracticeMenuView {
    constructor(page) {
        this.page = page;
    }
    render(catalog) {
        const host = this.page.byId("practiceGames");
        host.innerHTML = catalog.all().map((definition) => this.card(definition)).join("");
        FoldCard.bindAll(host);
    }
    onPick(handler) {
        this.page.byId("practiceGames").onclick = (event) => {
            const button = event.target.closest("button[data-game]");
            if (button && button.dataset.game)
                handler(button.dataset.game);
        };
    }
    onLeave(handler) { this.page.byId("btnPracticeLeave").onclick = handler; }
    card(definition) {
        return "<div class='st-card'><h2>" + Html.escape(definition.title) + "</h2>" + GameCardHtml.summary(definition)
            + "<button type='button' class='st-btn primary' data-game='" + definition.id + "' style='margin-top:10px'>연습 시작</button>"
            + "<div class='st-fold' style='margin-top:10px'><h2 style='font-size:15px'>조작 방법 · 규칙</h2>" + GameCardHtml.details(definition) + "</div></div>";
    }
}
class SpectatorViewBar {
    constructor(page) {
        this.page = page;
        this.signature = "";
        this.pickHandler = () => undefined;
        this.bar = page.byId("viewBtns");
        this.bar.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
        this.bar.onclick = (event) => {
            const button = event.target.closest("button[data-id]");
            if (button && !button.disabled && button.dataset.id)
                this.pickHandler(button.dataset.id);
        };
    }
    onPick(handler) { this.pickHandler = handler; }
    render(model) {
        const visible = model.spectateButton && model.viewTargets.length > 0;
        this.page.show(this.bar, visible);
        if (!visible)
            return;
        const signature = model.viewTargets.map((target) => target.id + ":" + target.nick + (target.out ? "x" : "") + (target.id === model.viewingId ? "*" : "")).join("|");
        if (signature === this.signature)
            return;
        this.signature = signature;
        this.bar.innerHTML = model.viewTargets.map((target) => this.button(target, target.id === model.viewingId)).join("");
    }
    hide() {
        this.signature = "";
        this.page.show(this.bar, false);
    }
    button(target, viewing) {
        return "<button type='button' data-id='" + Html.escape(target.id) + "' class='" + (viewing ? "on" : "") + "'" + (target.out ? " disabled" : "") + " style='border-color:" + Palette.slotColor(target.slot) + "'><small>" + (target.ai ? "AI" : "시점") + "</small>" + Html.escape(target.nick) + "</button>";
    }
}
class CollectionLobbyView {
    constructor(page, catalog) {
        this.page = page;
        this.catalog = catalog;
        this.code = page.byId("lobbyCode");
        this.playerBox = page.byId("lobbyPlayers");
        this.spectatorBox = page.byId("lobbySpectators");
        this.playerHead = page.byId("lobbyPlayerHead");
        this.spectatorHead = page.byId("lobbySpectatorHead");
        this.roleButton = page.byId("btnRole");
        this.aiNote = page.byId("aiNote");
        this.startButton = page.byId("btnStart");
        this.hint = page.byId("lobbyHint");
        this.planBox = page.byId("lobbyPlan");
        this.recordCard = page.byId("recCard");
        this.records = page.byId("lobbyRecs");
    }
    onStart(handler) { this.startButton.onclick = handler; }
    onLeave(handler) { this.page.byId("btnLeave").onclick = handler; }
    onSwitchSeat(handler) { this.roleButton.onclick = handler; }
    showCode(code) {
        this.page.setText(this.code, code);
    }
    render(session) {
        const seated = session.seatedIds();
        const spectators = session.spectatorIds();
        this.playerBox.innerHTML = seated.map((id) => this.playerRow(session, id)).join("");
        this.spectatorBox.innerHTML = spectators.length ? spectators.map((id) => this.playerRow(session, id)).join("") : "<div class='plRow empty'>비어 있어요</div>";
        this.page.setText(this.playerHead, "참가자 " + session.playingHumanCount() + " / " + CollectionRules.MAX_PLAYERS);
        this.page.setText(this.spectatorHead, "📺 관전자 " + spectators.length + " / " + CollectionRules.MAX_SPECTATORS);
        const playing = session.playingHumanCount();
        this.page.show(this.aiNote, playing < CollectionRules.MIN_FIELD_SIZE);
        this.page.setText(this.aiNote, "참가자가 " + CollectionRules.MIN_FIELD_SIZE + "명보다 적으면 " + CollectionRules.MIN_FIELD_SIZE + "명이 될 때까지 AI가 채워져요.");
        this.page.setText(this.roleButton, session.isSpectator() ? "참가자로 바꾸기" : "📺 관전자로 보기");
        this.roleButton.disabled = !session.canSwitchSeat();
        const host = session.isHost();
        this.startButton.disabled = !host || playing < 1;
        this.page.setText(this.startButton, host ? (playing < CollectionRules.MIN_FIELD_SIZE ? "AI와 게임 시작" : "게임 시작") : "방장이 시작하기를 기다리는 중");
        this.page.setText(this.hint, host ? "참가자 " + playing + "명 · 최대 " + CollectionRules.MAX_PLAYERS + "명 (관전 " + spectators.length + " / " + CollectionRules.MAX_SPECTATORS + ")" : "");
        const order = session.playerIds();
        this.planBox.innerHTML = PlanBuilder.build(this.catalog.ids(), CollectionRules.ROUNDS_PER_GAME)
            .map((id, index) => "<div class='plRow'><b>" + (index + 1) + ". " + Html.escape(this.catalog.find(id).title) + "</b></div>").join("");
        const winners = order.filter((id) => session.winsOf(id));
        this.page.show(this.recordCard, winners.length > 0);
        this.records.innerHTML = winners.map((id) => "<div class='st-rec'><span>" + Html.escape(session.player(id).nick) + "</span><b>" + session.winsOf(id) + "승</b></div>").join("");
    }
    playerRow(session, id) {
        const record = session.player(id);
        const tag = id === session.hostId ? "방장" : "";
        const dotColor = record.spectator ? "#8E93A0" : Palette.slotColor(record.slot || 0);
        return "<div class='plRow" + (id === session.myId ? " me" : "") + "'><i style='background:" + dotColor + "'></i><b>" + Html.escape(record.nick) + (record.isAI ? " (AI)" : "") + "</b><small>" + tag + "</small></div>";
    }
}
class CollectionResultView {
    constructor(page, catalog) {
        this.page = page;
        this.catalog = catalog;
        this.title = page.byId("resultTitle");
        this.head = page.byId("resultHead");
        this.body = page.byId("resultBody");
        this.nextIn = page.byId("nextIn");
        this.toLobbyButton = page.byId("btnToLobby");
        this.leaveButton = page.byId("btnResultLeave");
    }
    onToLobby(handler) { this.toLobbyButton.onclick = handler; }
    onLeave(handler) { this.leaveButton.onclick = handler; }
    renderRound(round, totalRounds, scores, result, localId, directory) {
        const ranks = result.ranks || {}, names = result.names || {};
        const definition = this.catalog.find(round.kind);
        this.page.setText(this.title, (definition ? definition.title : "") + " 결과 (" + round.n + " / " + totalRounds + ")");
        const ids = Object.keys(ranks).sort((a, b) => ranks[a] - ranks[b]);
        const notes = result.notes || null;
        this.head.innerHTML = "<tr><th>순위</th><th>이름</th>" + (notes ? "<th class='n'>기록</th>" : "") + "<th class='n'>이번 종목</th><th class='n'>누적 점수</th></tr>";
        this.body.innerHTML = ids.map((id) => "<tr class='" + (id === localId ? "meRow" : "") + "'><td><b>" + ranks[id] + "</b></td><td>" + this.nameCell(id, names[id], directory) + "</td>" + (notes ? "<td class='n'>" + Html.escape(notes[id] || "") + "</td>" : "") + "<td class='n'>+" + ScoreTable.pointsFor(ranks[id]) + "</td><td class='n'><b>" + scores.total(id) + "</b>점</td></tr>").join("");
    }
    renderFinal(scores, localId, directory) {
        this.page.setText(this.title, "최종 결과");
        const ids = scores.idsByTotal();
        this.head.innerHTML = "<tr><th>순위</th><th>이름</th><th class='n'>누적 점수</th></tr>";
        let place = 0, previous = null;
        this.body.innerHTML = ids.map((id, index) => {
            if (scores.total(id) !== previous) {
                place = index + 1;
                previous = scores.total(id);
            }
            return "<tr class='" + (id === localId ? "meRow" : "") + "'><td><b>" + place + "</b></td><td>" + this.nameCell(id, scores.nick(id), directory) + "</td><td class='n'><b>" + scores.total(id) + "</b>점</td></tr>";
        }).join("");
        const winners = scores.topIds().map((id) => scores.nick(id));
        this.page.setText(this.nextIn, winners.length ? "🏆 최종 우승: " + winners.join(", ") : "");
    }
    showButtons(final, host) {
        this.page.show(this.toLobbyButton, final && host);
        this.page.show(this.leaveButton, final);
        if (final && !host)
            this.page.setText(this.nextIn, (this.nextIn.textContent || "") + " · 방장이 대기실로 이동할 때까지 기다려 주세요");
    }
    showCountdown(text) {
        this.page.setText(this.nextIn, text);
    }
    nameCell(id, nick, directory) {
        const info = directory.lookup(id);
        const slot = info ? info.slot : 0, ai = info ? info.ai : false;
        return "<i class='rankDot' style='background:" + Palette.slotColor(slot || 0) + "'></i>" + Html.escape(nick || "?") + (ai ? " (AI)" : "");
    }
}
