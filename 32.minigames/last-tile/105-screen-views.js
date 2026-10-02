"use strict";
class StartView {
    constructor(page) {
        this.page = page;
        this.createButton = page.byId("btnCreate");
        this.joinButton = page.byId("btnJoin");
        this.codeInput = page.byId("joinCode");
        this.message = page.byId("startMsg");
        this.loadNote = page.byId("loadNote");
    }
    onCreate(handler) { this.createButton.onclick = handler; }
    onJoin(handler) { this.joinButton.onclick = handler; }
    onEnterInCode(handler) {
        this.codeInput.onkeydown = (event) => { if (event.key === "Enter")
            handler(); };
    }
    enteredCode() {
        return this.codeInput.value.replace(/\D/g, "");
    }
    showMessage(text) {
        this.page.setText(this.message, text);
    }
    showLoadNote(text) {
        this.page.setText(this.loadNote, text);
    }
    setCreateEnabled(enabled) { this.createButton.disabled = !enabled; }
    setJoinEnabled(enabled) { this.joinButton.disabled = !enabled; }
    setOnlineReady(ready) {
        this.createButton.disabled = !ready;
        this.joinButton.disabled = !ready;
    }
}
class LastTileLobbyView {
    constructor(page) {
        this.page = page;
        this.code = page.byId("lobbyCode");
        this.playerBox = page.byId("lobbyPlayers");
        this.aiNote = page.byId("aiNote");
        this.startButton = page.byId("btnStart");
        this.hint = page.byId("lobbyHint");
        this.recordCard = page.byId("recCard");
        this.records = page.byId("lobbyRecs");
    }
    onStart(handler) { this.startButton.onclick = handler; }
    onLeave(handler) { this.page.byId("btnLeave").onclick = handler; }
    showCode(code) {
        this.page.setText(this.code, code);
    }
    render(session) {
        const order = session.playerIds();
        this.playerBox.innerHTML = order.map((id) => this.playerRow(session, id)).join("");
        const humanCount = session.humanIds().length;
        this.page.show(this.aiNote, humanCount === 1);
        const host = session.isHost();
        this.startButton.disabled = !host;
        this.page.setText(this.startButton, host ? (humanCount === 1 ? "AI와 게임 시작" : "게임 시작") : "방장이 시작하기를 기다리는 중");
        this.page.setText(this.hint, host ? "참가자 " + order.length + "명 · 최대 " + LastTileRules.MAX_PLAYERS + "명" : "");
        const winners = order.filter((id) => session.winsOf(id));
        this.page.show(this.recordCard, winners.length > 0);
        this.records.innerHTML = winners.map((id) => "<div class='st-rec'><span>" + Html.escape(session.player(id).nick) + "</span><b>" + session.winsOf(id) + "승</b></div>").join("");
    }
    playerRow(session, id) {
        const record = session.player(id);
        const tag = id === session.hostId ? "방장" : "";
        return "<div class='plRow" + (id === session.myId ? " me" : "") + "'><i style='background:" + Palette.slotColor(record.slot || 0) + "'></i><b>" + Html.escape(record.nick) + (record.isAI ? " (AI)" : "") + "</b><small>" + tag + "</small></div>";
    }
}
class ResultView {
    constructor(page) {
        this.page = page;
        this.title = page.byId("resultTitle");
        this.head = page.byId("resultHead");
        this.body = page.byId("resultBody");
        this.nextIn = page.byId("nextIn");
        this.toLobbyButton = page.byId("btnToLobby");
        this.leaveButton = page.byId("btnResultLeave");
    }
    onToLobby(handler) { this.toLobbyButton.onclick = handler; }
    onLeave(handler) { this.leaveButton.onclick = handler; }
    renderRound(round, scores, result, localId, directory) {
        const ranks = result.ranks || {}, names = result.names || {};
        this.page.setText(this.title, round + "판 결과");
        const ids = Object.keys(ranks).sort((a, b) => ranks[a] - ranks[b]);
        this.head.innerHTML = "<tr><th>순위</th><th>이름</th><th class='n'>이번 판</th><th class='n'>누적 점수</th></tr>";
        this.body.innerHTML = ids.map((id) => "<tr class='" + (id === localId ? "meRow" : "") + "'><td><b>" + ranks[id] + "</b></td><td>" + this.nameCell(id, names[id], directory) + "</td><td class='n'>+" + ScoreTable.pointsFor(ranks[id]) + "</td><td class='n'><b>" + scores.total(id) + "</b>점</td></tr>").join("");
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
