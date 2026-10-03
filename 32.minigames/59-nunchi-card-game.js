"use strict";
class NunchiHandView {
    constructor(page, elements, env, listener) {
        this.page = page;
        this.listener = listener;
        this.buttons = [];
        this.signature = "";
        this.alive = true;
        this.root = page.byId("nunchiHand");
        this.root.innerHTML = "";
        this.hint = elements.create("div");
        this.hint.className = "nhHint";
        const fan = elements.create("div");
        fan.className = "nhFan";
        for (let card = 1; card <= NunchiRules.CARD_COUNT; card++)
            fan.appendChild(this.buildCard(elements, card));
        this.submit = elements.create("button");
        this.submit.type = "button";
        this.submit.className = "nhSubmit";
        this.submit.textContent = "내기";
        this.submit.addEventListener("click", () => this.listener.onSubmit());
        this.root.appendChild(this.hint);
        this.root.appendChild(fan);
        this.root.appendChild(this.submit);
        env.onKeyDown((key) => this.handleKey(key));
    }
    render(model) {
        const signature = JSON.stringify(model);
        if (signature === this.signature)
            return;
        this.signature = signature;
        this.page.show(this.root, model.visible);
        this.page.setText(this.hint, model.hint);
        this.submit.disabled = !model.canSubmit;
        model.cards.forEach((entry) => {
            const button = this.buttons[entry.card - 1];
            button.className = "nhCard" + (entry.used ? " used" : "") + (entry.selected ? " up" : "") + (entry.sealed ? " sealed" : "");
            button.disabled = entry.used || !model.canPick;
        });
    }
    dispose() {
        this.alive = false;
        this.root.innerHTML = "";
        this.page.show(this.root, false);
    }
    buildCard(elements, card) {
        const button = elements.create("button");
        button.type = "button";
        button.textContent = String(card);
        button.style.setProperty("--tilt", (card - 1 - (NunchiRules.CARD_COUNT - 1) / 2) * NunchiHandView.FAN_DEGREES + "deg");
        button.style.setProperty("--sink", Math.pow(card - 1 - (NunchiRules.CARD_COUNT - 1) / 2, 2) * 2.4 + "px");
        button.addEventListener("click", () => this.listener.onSelect(card));
        this.buttons.push(button);
        return button;
    }
    handleKey(key) {
        if (!this.alive || key.inTextField || key.repeat)
            return;
        const digit = NunchiHandView.DIGIT_CODE.exec(key.code);
        if (digit) {
            key.preventDefault();
            this.listener.onSelect(+digit[1]);
        }
        else if (NunchiHandView.SUBMIT_CODES.indexOf(key.code) >= 0) {
            key.preventDefault();
            this.listener.onSubmit();
        }
    }
}
NunchiHandView.DIGIT_CODE = /^(?:Digit|Numpad)([1-6])$/;
NunchiHandView.SUBMIT_CODES = ["Enter", "Space"];
NunchiHandView.FAN_DEGREES = 7;
class NunchiLocalPlayer {
    constructor(id, schedule, state, vault, outlet) {
        this.id = id;
        this.schedule = schedule;
        this.state = state;
        this.vault = vault;
        this.outlet = outlet;
        this.selected = null;
        this.selectedRound = -1;
        this.revealed = new Set();
    }
    selectedCard(round) {
        return this.selectedRound === round ? this.selected : null;
    }
    sealedCard(round) {
        return this.vault.cardOf(round);
    }
    canPick(now) {
        const moment = this.schedule.moment(now);
        return moment.phase === "pick" && this.state.nextRound() === moment.round && this.vault.cardOf(moment.round) === null;
    }
    select(card, now) {
        if (!this.canPick(now) || !this.state.hand(this.id).has(card))
            return;
        this.selected = card;
        this.selectedRound = this.schedule.moment(now).round;
    }
    submit(now) {
        const round = this.schedule.moment(now).round;
        const card = this.selectedCard(round);
        if (card !== null && this.canPick(now))
            this.seal(round, card, now);
    }
    step(now) {
        const moment = this.schedule.moment(now);
        if (moment.phase === "intro")
            return;
        const round = moment.round;
        if (moment.phase !== "pick" && now < this.schedule.commitCutoff(round) && this.state.nextRound() === round && this.vault.cardOf(round) === null) {
            const card = this.selectedCard(round);
            if (card !== null)
                this.seal(round, card, now);
        }
        this.revealIfDue(round, now);
    }
    seal(round, card, now) {
        const hash = this.vault.seal(round, card);
        this.outlet.sendCommit(round, { h: hash, t: now });
    }
    revealIfDue(round, now) {
        if (now < this.schedule.revealAt(round) || this.revealed.has(round) || this.state.nextRound() > round)
            return;
        const record = this.vault.reveal(round);
        if (!record)
            return;
        this.revealed.add(round);
        this.outlet.sendReveal(round, record);
    }
}
class NunchiHudBuilder {
    constructor(localId, startAt, participants) {
        this.localId = localId;
        this.startAt = startAt;
        this.participants = participants;
    }
    build(input, now) {
        const started = input.moment.phase !== "intro";
        const message = this.messageFor(input, now, started);
        return {
            rows: NunchiStandings.ordered(this.participants, (participant) => participant.id, (id) => input.scores.get(id) || 0).map((participant) => this.rowOf(participant, input)),
            summary: started ? "라운드 " + (input.moment.round + 1) + "/" + NunchiRules.ROUNDS + " · 상품 " + this.prizeText(input) : "곧 시작해요",
            clock: this.clockText(input),
            footer: input.pot > 0 ? "이월 상금 " + input.pot + "점" : "이월 없음",
            viewTargets: [],
            viewingId: null,
            cooldowns: [],
            bannerHtml: message.banner,
            bannerWarning: message.warning,
            centerText: message.center,
            spectateButton: false
        };
    }
    prizeText(input) {
        return input.prize.points + "점" + (input.prize.star ? "★" : "") + (input.pot > 0 ? " + 이월 " + input.pot : "");
    }
    clockText(input) {
        if (input.moment.phase !== "pick")
            return "0:00";
        const left = Math.ceil((NunchiRules.PICK_MS - input.moment.elapsedMs) / 1000);
        return "0:" + ("0" + Math.max(0, left)).slice(-2);
    }
    rowOf(participant, input) {
        const mark = input.moment.phase === "pick" && input.placed.has(participant.id) ? " ✓" : "";
        const left = input.departed.has(participant.id) ? " (나감)" : "";
        return {
            id: participant.id,
            nick: participant.nick,
            slot: participant.slot,
            ai: participant.ai,
            dead: false,
            detail: (input.scores.get(participant.id) || 0) + "점" + mark + left
        };
    }
    messageFor(input, now, started) {
        if (!started) {
            const left = this.startAt - now;
            return { banner: "", warning: false, center: left > 0 ? String(Math.ceil(left / 1000)) : "" };
        }
        if (!input.participates)
            return { banner: NunchiHudBuilder.SPECTATOR_MESSAGE, warning: false, center: "" };
        if (input.shown)
            return { banner: this.outcomeText(input.shown), warning: false, center: "" };
        if (input.moment.phase === "pick") {
            const urgent = NunchiRules.PICK_MS - input.moment.elapsedMs < NunchiHudBuilder.WARNING_LEFT_MS && !input.sealed;
            return { banner: input.sealed ? "카드를 냈어요! 다른 사람을 기다려요" : "카드를 한 장 골라 내세요", warning: urgent, center: "" };
        }
        return { banner: "카드를 공개해요…", warning: false, center: "" };
    }
    outcomeText(shown) {
        if (shown.elapsedMs < NunchiShowTimeline.GLOW_AT)
            return "카드를 공개해요…";
        const outcome = shown.outcome;
        if (outcome.winnerId) {
            const winner = this.participants.find((participant) => participant.id === outcome.winnerId);
            return (outcome.winnerId === this.localId ? "내가" : "<b>" + Html.escape(winner ? winner.nick : "") + "</b> 님이") + " 상품 " + outcome.awarded + "점 획득!";
        }
        const last = outcome.round >= NunchiRules.ROUNDS - 1;
        return "모두 부딪쳤어요! 상품 " + outcome.carryOut + "점은 " + (last ? "사라져요" : "다음 라운드로 이월");
    }
}
NunchiHudBuilder.SPECTATOR_MESSAGE = "관전 중 · 다음 종목부터 함께해요";
NunchiHudBuilder.WARNING_LEFT_MS = 3000;
class NunchiCardGame extends MiniGame {
    constructor(context) {
        super(context);
        this.ledger = new NunchiLedger();
        this.receivedAt = new Map();
        this.departed = new Set();
        const ids = context.participants.map((participant) => participant.id);
        const mine = context.participants.find((participant) => participant.id === context.localId);
        this.schedule = new NunchiSchedule(context.startAt);
        this.state = new NunchiMatchState(context.seed, ids);
        this.wire = new NunchiWire(context.wire);
        this.stage = new NunchiTableScene(context.libs);
        this.camera = new NunchiCamera(this.stage.camera, context.env);
        const viewKit = new FighterViewKit(context.libs, context.page, new NameTagFactory(context.libs, context.page));
        this.table = new NunchiTableStage(viewKit, context.characters.factory, context.characters.assets, new NunchiCardKit(context.libs, context.page), this.stage.world, context.participants, context.looks, mine ? mine.slot : 0);
        this.referee = new NunchiReferee(context.host, context.seed, context.participants, this.schedule, this.state, this.ledger, new NunchiAiPicker(context.seed, ids), this);
        const vault = new NunchiVault(context.seed, context.localId, new TokenSource(new RandomRange(new MathRandomSource())));
        this.local = mine ? new NunchiLocalPlayer(context.localId, this.schedule, this.state, vault, this) : null;
        this.handView = new NunchiHandView(context.page, new ElementFactory(), context.env, this);
        this.hudBuilder = new NunchiHudBuilder(context.localId, context.startAt, context.participants);
        this.handlers = NunchiWire.handlers(this);
    }
    streams() {
        return NunchiWire.streams();
    }
    controls() {
        return { stick: false, buttons: [] };
    }
    startAt() {
        return this.context.startAt;
    }
    tick(dt, draw) {
        const now = this.context.clock.now();
        this.referee.step(now);
        if (this.local)
            this.local.step(now);
        if (draw)
            this.draw(now, dt);
    }
    perform(action) {
        return;
    }
    spectateNext() {
        return;
    }
    receive(stream, key, value) {
        const handler = this.handlers[stream];
        if (handler)
            handler(key, value);
    }
    receiveCommit(key, value) {
        const record = NunchiRecords.commit(value);
        if (record && NunchiKeys.parse(key))
            this.ledger.addCommit(key, record);
    }
    receiveReveal(key, value) {
        const record = NunchiRecords.reveal(value);
        if (record && NunchiKeys.parse(key))
            this.ledger.addReveal(key, record);
    }
    receiveResult(key, value) {
        const round = +key;
        const record = NunchiRecords.result(value);
        if (!Number.isInteger(round) || !record)
            return;
        this.ledger.addResult(round, record);
        this.applyResults();
    }
    publishResult(round, record) {
        this.ledger.addResult(round, record);
        this.wire.publishResult(round, record);
        this.applyResults();
    }
    sendCommit(round, record) {
        this.announcePlaced(round, this.context.localId, record);
    }
    announcePlaced(round, id, record) {
        this.ledger.addCommit(NunchiKeys.entry(round, id), record);
        this.wire.publishCommit(round, id, record);
    }
    sendReveal(round, record) {
        this.wire.publishReveal(round, this.context.localId, record);
    }
    onSelect(card) {
        if (this.local)
            this.local.select(card, this.context.clock.now());
    }
    onSubmit() {
        if (this.local)
            this.local.submit(this.context.clock.now());
    }
    playerDeparted(id) {
        this.departed.add(id);
    }
    isOver() {
        const now = this.context.clock.now();
        if (now < this.schedule.endAt())
            return false;
        return this.state.isComplete() || now >= this.schedule.endAt() + NunchiRules.OVER_FALLBACK_MS;
    }
    ranking() {
        return NunchiStandings.ranking(this.context.participants.map((participant) => participant.id), (id) => this.state.score(id));
    }
    hud(now) {
        return this.hudBuilder.build(this.hudInput(now), now);
    }
    conclude() {
        return;
    }
    dispose() {
        this.handView.dispose();
        this.table.dispose();
        this.stage.releaseMaterials();
    }
    applyResults() {
        while (this.state.nextRound() < NunchiRules.ROUNDS) {
            const round = this.state.nextRound();
            const record = this.ledger.resultFor(round);
            if (!record)
                return;
            const offered = new Map();
            Object.keys(record.c).forEach((id) => offered.set(id, record.c[id]));
            if (!this.state.apply(round, offered))
                return;
            this.receivedAt.set(round, this.context.clock.now());
        }
    }
    shownAt(round, now) {
        const outcome = this.state.outcomeOf(round);
        const received = this.receivedAt.get(round);
        return outcome && received !== undefined ? { outcome, elapsedMs: now - received } : null;
    }
    displayedScores(shown) {
        const scores = new Map();
        this.context.participants.forEach((participant) => {
            const pending = shown && shown.elapsedMs < NunchiShowTimeline.AWARD_AT && shown.outcome.winnerId === participant.id ? shown.outcome.awarded : 0;
            scores.set(participant.id, this.state.score(participant.id) - pending);
        });
        return scores;
    }
    displayedPot(shown) {
        if (!shown)
            return this.state.carryIn();
        if (!shown.outcome.winnerId)
            return shown.outcome.carryOut;
        return shown.elapsedMs < NunchiShowTimeline.AWARD_AT ? shown.outcome.carryIn : 0;
    }
    placedIds(round) {
        const placed = new Set();
        this.context.participants.forEach((participant) => {
            if (this.ledger.isPlaced(round, participant.id))
                placed.add(participant.id);
        });
        return placed;
    }
    hudInput(now) {
        const moment = this.schedule.moment(now);
        const shown = this.shownAt(moment.round, now);
        return {
            moment,
            prize: this.state.prizeFor(moment.round),
            pot: this.displayedPot(shown),
            scores: this.displayedScores(shown),
            placed: this.placedIds(moment.round),
            shown,
            departed: this.departed,
            participates: this.local !== null,
            sealed: !!this.local && this.local.sealedCard(moment.round) !== null
        };
    }
    handModel(moment, now) {
        if (!this.local)
            return { visible: false, cards: [], canPick: false, canSubmit: false, hint: "" };
        const hand = this.state.hand(this.context.localId);
        const selected = this.local.selectedCard(moment.round);
        const sealed = this.local.sealedCard(moment.round);
        const canPick = this.local.canPick(now);
        const cards = [];
        for (let card = 1; card <= NunchiRules.CARD_COUNT; card++) {
            cards.push({ card, used: !hand.has(card), selected: selected === card && sealed === null, sealed: sealed === card });
        }
        return { visible: moment.phase !== "intro", cards, canPick, canSubmit: canPick && selected !== null, hint: this.hintFor(moment, canPick, selected, sealed) };
    }
    hintFor(moment, canPick, selected, sealed) {
        if (sealed !== null)
            return "카드를 냈어요";
        if (canPick)
            return selected === null ? "카드를 한 장 고르세요 (키보드 1~6)" : "‘내기’를 눌러 확정하세요 (엔터)";
        return moment.phase === "pick" ? "이전 결과를 기다려요" : "결과를 지켜봐요";
    }
    draw(now, dt) {
        const input = this.hudInput(now);
        this.table.update({
            phase: input.moment.phase,
            roundElapsedMs: input.moment.elapsedMs,
            prize: input.prize,
            pot: input.pot,
            placed: input.placed,
            shown: input.shown,
            scores: input.scores
        }, now, dt);
        this.handView.render(this.handModel(input.moment, now));
        this.camera.place();
        this.context.render.render(this.stage.scene, this.stage.camera);
    }
}
class NunchiCardBackdrop extends GameBackdrop {
    constructor(context) {
        super();
        this.context = context;
        this.seatCards = [];
        this.chips = [];
        this.stage = new NunchiTableScene(context.libs);
        this.camera = new NunchiCamera(this.stage.camera, context.env);
        this.kit = new NunchiCardKit(context.libs, new Page());
        this.prize = new NunchiCardMesh(this.kit, this.stage.world);
        this.prize.setFace(this.kit.prizeTexture(new NunchiPrizeCard(5, true)));
        for (let relative = 0; relative < NunchiRules.SEAT_COUNT; relative++) {
            const spot = NunchiLayout.seat(relative);
            this.seatCards.push(new NunchiCardMesh(this.kit, this.stage.world));
            this.chips.push(new NunchiChipStack(context.libs, this.stage.world, Palette.slotColor(relative), { x: spot.chipX, z: spot.chipZ }, { x: spot.columnX, z: spot.columnZ }));
            this.chips[relative].setCount(NunchiCardBackdrop.CHIP_SAMPLE[relative]);
        }
    }
    render(dt) {
        const t = this.context.clock.now() / 1000;
        this.prize.pose(0, NunchiLayout.CARD_Y + Math.sin(t * 2) * NunchiCardBackdrop.BOB_HEIGHT, 0, t * 0.4, 1, 1);
        this.seatCards.forEach((card, relative) => {
            const spot = NunchiLayout.seat(relative);
            card.pose(spot.cardX, NunchiLayout.CARD_Y + Math.max(0, Math.sin(t * 1.6 + relative)) * 0.12, spot.cardZ, spot.cardYaw, 0, 1);
        });
        this.camera.showcase(dt);
        this.context.render.render(this.stage.scene, this.stage.camera);
    }
    dispose() {
        this.prize.dispose();
        this.seatCards.forEach((card) => card.dispose());
        this.chips.forEach((stack) => stack.dispose());
        this.kit.dispose();
        this.stage.releaseMaterials();
    }
}
NunchiCardBackdrop.BOB_HEIGHT = 0.08;
NunchiCardBackdrop.CHIP_SAMPLE = [4, 9, 2, 12, 6, 15];
class NunchiCardDefinition extends GameDefinition {
    constructor() {
        super(...arguments);
        this.id = "nunchi";
        this.title = "눈치 카드";
        this.summary = "상대가 낼 숫자를 읽고 큰 카드를 아껴 쓰는 6라운드 카드 대결";
        this.keyHelp = [
            { keys: ["1", "2", "3", "4", "5", "6"], text: "카드 고르기" },
            { keys: ["엔터", "스페이스"], text: "고른 카드 내기" },
            { keys: ["태블릿"], text: "아래 카드를 눌러 고르고 ‘내기’ 단추로 확정" }
        ];
        this.rules = [
            "모두 <b>1~6 카드 한 벌</b>을 들고 시작해요. 카드는 한 번 쓰면 사라져요. 총 <b>6라운드</b>예요.",
            "라운드마다 <b>상품 카드</b>(1~5점, 가끔 ★ +2점)가 공개돼요. 제한 시간 <b>10초</b> 안에 카드를 한 장 뒷면으로 내려놓아요. 못 정하면 남은 카드 중 하나가 자동으로 나가요.",
            "한꺼번에 공개해서 <b>같은 숫자를 낸 사람끼리는 카드가 부딪쳐 사라져요</b>. 남은 카드 중 가장 큰 숫자를 낸 사람이 상품 카드를 가져가요.",
            "모든 카드가 부딪치면 상품 카드는 <b>다음 라운드로 이월</b>돼 상금이 쌓여요. 6라운드 뒤 점수가 높은 순으로 순위가 정해져요."
        ];
    }
    preload() {
        return Promise.resolve();
    }
    create(context) {
        return new NunchiCardGame(context);
    }
    createBackdrop(context) {
        return new NunchiCardBackdrop(context);
    }
}
