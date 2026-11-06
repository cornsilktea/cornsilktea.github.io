"use strict";
class MoleHudBuilder {
    constructor(localId, startAt, match) {
        this.localId = localId;
        this.startAt = startAt;
        this.match = match;
    }
    build(now) {
        const rel = now - this.startAt;
        const lines = MoleStandings.order(this.match.lines(Math.max(0, rel)));
        const mine = lines.find((line) => line.id === this.localId) || null;
        const locked = mine !== null && mine.tally.isLocked(rel);
        return {
            rows: lines.map((line) => this.rowOf(line)),
            summary: mine ? "콤보 " + mine.tally.combo + " · 배율 ×" + mine.tally.multiplier() : "",
            clock: this.clockText(rel),
            footer: mine ? "최고 콤보 " + mine.tally.bestCombo : MoleHudBuilder.SPECTATOR_NOTE,
            viewTargets: [],
            viewingId: null,
            cooldowns: [],
            bannerHtml: locked && mine ? "입력 잠김 " + Math.max(0, (mine.tally.lockedUntil - rel) / 1000).toFixed(1) + "초" : "",
            bannerWarning: locked,
            centerText: rel < 0 ? String(Math.max(1, Math.ceil(-rel / 1000))) : "",
            spectateButton: false
        };
    }
    rowOf(line) {
        const contestant = this.match.contestant(line.id);
        const participant = contestant.participant;
        const combo = line.tally.combo > 1 ? " · " + line.tally.combo + "콤보" : "";
        return {
            id: line.id,
            nick: participant.nick,
            slot: participant.slot,
            ai: participant.ai,
            dead: contestant.hasDeparted(),
            detail: contestant.hasDeparted() ? line.tally.score + "점 (나감)" : line.tally.score + "점" + combo
        };
    }
    clockText(rel) {
        const left = MathUtil.clamp(MoleRules.GAME_MS - rel, 0, MoleRules.GAME_MS);
        const seconds = Math.ceil(left / 1000);
        return Math.floor(seconds / 60) + ":" + ("0" + seconds % 60).slice(-2);
    }
}
MoleHudBuilder.SPECTATOR_NOTE = "관전 중";
class MoleGame extends MiniGame {
    constructor(context, assets) {
        super(context);
        this.concluded = false;
        this.endAt = context.startAt + MoleRules.GAME_MS;
        this.match = new MoleMatch(context.participants, context.seed, context.localId);
        this.localPlayer = new MoleLocalPlayer(this.match, context.localId);
        this.stage = new MoleStage(context.libs, context.page, context.env, assets, context.characters, this.match, context.looks, context.localId);
        this.wire = new MoleWire(context.wire);
        this.outbox = new MoleOutbox(this.wire, context.localId);
        this.flash = new MoleScreenFlash(context.page, context.env);
        this.hudBuilder = new MoleHudBuilder(context.localId, context.startAt, this.match);
        this.handlers = MoleWire.handlers(this);
        const place = this.stage.localPlace();
        this.picker = place && this.localParticipates()
            ? new MoleBoardPicker(context.libs, context.page.byId("view"), this.stage.scenery.camera, place, (cell) => this.tapCell(cell))
            : null;
        assets.loadClips();
    }
    streams() {
        return MoleWire.streams();
    }
    controls() {
        return { stick: false, buttons: MoleCellKeys.buttons() };
    }
    startAt() {
        return this.context.startAt;
    }
    tick(dt, draw) {
        const now = this.context.clock.now();
        this.publish();
        if (draw)
            this.draw(now - this.context.startAt, dt);
    }
    perform(action) {
        const cell = MoleCellAction.cellOf(action);
        if (cell >= 0)
            this.tapCell(cell);
    }
    spectateNext() {
        return;
    }
    receive(stream, key, value) {
        const handler = this.handlers[stream];
        if (handler)
            handler(key, value);
    }
    receiveHits(key, value) {
        const entries = MoleHitCodec.decode(value);
        if (entries)
            this.match.receive(key, entries);
    }
    playerDeparted(id) {
        const contestant = this.match.contestant(id);
        if (contestant)
            contestant.markDeparted();
    }
    isOver() {
        return this.context.clock.now() >= this.endAt + MoleRules.END_GRACE_MS;
    }
    ranking() {
        return this.match.ranking();
    }
    resultNotes() {
        const notes = {};
        this.match.lines(MoleRules.GAME_MS).forEach((line) => {
            notes[line.id] = "점수 " + line.tally.score + " · 최고 콤보 " + line.tally.bestCombo;
        });
        return notes;
    }
    hud(now) {
        return this.hudBuilder.build(now);
    }
    conclude() {
        this.concluded = true;
    }
    dispose() {
        this.concluded = true;
        if (this.picker)
            this.picker.dispose();
        this.flash.hide();
        this.stage.dispose();
    }
    tapCell(cell) {
        if (this.concluded)
            return;
        const rel = Math.round(this.context.clock.now() - this.context.startAt);
        if (this.localPlayer.tap(cell, rel))
            this.outbox.markDirty();
    }
    publish() {
        if (this.concluded)
            return;
        const me = this.match.contestant(this.context.localId);
        if (me && !me.computed)
            this.outbox.flush(this.context.env.nowMs(), me.allEntries());
    }
    draw(rel, dt) {
        const outcomes = this.stage.update(rel, dt);
        if (outcomes.some((outcome) => outcome.kind === "hit" && outcome.points < 0))
            this.flash.pulse();
        if (this.picker)
            this.stage.camera.player(dt);
        else
            this.stage.camera.overview(dt);
        this.context.render.render(this.stage.scenery.scene, this.stage.scenery.camera);
    }
}
class MoleBackdrop extends GameBackdrop {
    constructor(context, assets, characters) {
        super();
        this.context = context;
        this.assets = assets;
        this.characters = characters;
        this.page = new Page();
        this.looks = new Map();
        this.participants = MoleBackdrop.DEMO_NAMES.map((nick, slot) => ({ id: "demo" + slot, nick, ai: true, slot }));
        this.participants.forEach((participant) => this.looks.set(participant.id, CharacterLooks.random()));
        this.startedAt = context.clock.now();
        this.stage = this.buildStage();
        assets.loadClips();
    }
    render(dt) {
        const now = this.context.clock.now();
        if (now - this.startedAt > MoleBackdrop.RESTART_AFTER_MS)
            this.restart(now);
        this.stage.update(now - this.startedAt, dt);
        this.stage.camera.showcase(dt);
        this.context.render.render(this.stage.scenery.scene, this.stage.scenery.camera);
    }
    dispose() {
        this.stage.dispose();
    }
    restart(now) {
        this.stage.dispose();
        this.startedAt = now;
        this.stage = this.buildStage();
    }
    buildStage() {
        const match = new MoleMatch(this.participants, this.context.clock.now() % 1000003, "");
        return new MoleStage(this.context.libs, this.page, this.context.env, this.assets, this.characters, match, this.looks, "");
    }
}
MoleBackdrop.DEMO_NAMES = ["a", "b", "c", "d", "e", "f"];
MoleBackdrop.RESTART_AFTER_MS = MoleRules.GAME_MS + 1500;
class MoleDefinition extends GameDefinition {
    constructor(libs, characters, factory) {
        super();
        this.characters = characters;
        this.factory = factory;
        this.id = "mole";
        this.title = "묘지 두더지";
        this.summary = "묘비에서 튀어나오는 스켈레톤을 60초 동안 빠르고 정확하게 잡는 개인전";
        this.keyHelp = [
            { keys: ["Q", "W", "E", "A", "S", "D", "Z", "X", "C"], text: "3×3 묘비와 같은 자리의 키를 눌러 내리치기 (숫자패드 7 8 9 / 4 5 6 / 1 2 3 도 돼요)" },
            { keys: ["태블릿"], text: "내 묘비를 직접 터치하기" }
        ];
        this.rules = [
            "6명이 각자 자기 묘지(묘비 3×3)를 갖고 60초 동안 튀어나오는 것을 망치로 잡아요. 나오는 순서와 자리는 모두 똑같아서 <b>누가 더 빠르고 정확한지</b>로 승부가 나요.",
            "<b>스켈레톤</b>은 +1점, <b>황금 해골</b>은 +5점(금방 사라져요). <b>호박 폭탄</b>은 치면 −3점에 콤보가 끊기고 0.8초 동안 기절해요. 그냥 두면 사라져요.",
            "연속으로 잡으면 <b>콤보</b>가 쌓여요. 5콤보부터 점수 ×2, 15콤보부터 ×3. 호박을 치거나 <b>빈 묘비를 헛치면</b> 콤보가 0이 되고 잠깐 못 쳐요.",
            "시간이 지날수록 더 빨리, 더 많이 나와요. 60초 때 점수가 높은 순서대로 순위가 정해져요."
        ];
        this.assets = new MoleAssets(libs, characters);
    }
    preload() {
        this.assets.loadClips();
        return this.assets.load();
    }
    create(context) {
        return new MoleGame(context, this.assets);
    }
    createBackdrop(context) {
        return new MoleBackdrop(context, this.assets, { assets: this.characters, factory: this.factory });
    }
}
