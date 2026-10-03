"use strict";
class TerritoryHudBuilder {
    constructor(localId, startAt, participants, board) {
        this.localId = localId;
        this.startAt = startAt;
        this.participants = participants;
        this.board = board;
    }
    build(now) {
        const mine = this.board.playerById(this.localId);
        const order = TerritoryStandings.order(this.board);
        const myPercent = mine ? TerritoryStandings.percent(this.board.grid, mine.index) : 0;
        const myRank = mine ? order.indexOf(mine) + 1 : 0;
        const message = this.messageFor(now, mine);
        return {
            rows: order.map((player) => this.rowOf(player)),
            summary: mine ? "내 순위 " + myRank + "위" : "",
            clock: this.clockText(now),
            footer: mine ? "내 땅 " + myPercent.toFixed(1) + "%" : "",
            viewTargets: [],
            viewingId: null,
            cooldowns: [],
            bannerHtml: message.banner,
            bannerWarning: message.warning,
            centerText: message.center,
            spectateButton: false
        };
    }
    rowOf(player) {
        const participant = this.participants[player.index];
        return {
            id: player.id,
            nick: participant.nick,
            slot: participant.slot,
            ai: participant.ai,
            dead: !player.alive,
            detail: TerritoryStandings.percent(this.board.grid, player.index).toFixed(1) + "%"
        };
    }
    clockText(now) {
        const left = MathUtil.clamp(this.startAt + TerritoryRules.GAME_MS - now, 0, TerritoryRules.GAME_MS);
        const seconds = Math.ceil(left / 1000);
        return Math.floor(seconds / 60) + ":" + ("0" + seconds % 60).slice(-2);
    }
    messageFor(now, mine) {
        if (now < this.startAt)
            return { banner: "", warning: false, center: String(Math.max(1, Math.ceil((this.startAt - now) / 1000))) };
        if (!mine)
            return { banner: TerritoryHudBuilder.SPECTATOR_MESSAGE, warning: false, center: "" };
        if (!mine.alive) {
            const left = Math.max(1, Math.ceil((mine.respawnTick - this.board.tick) * TerritoryRules.STEP_MS / 1000));
            return { banner: "쓰러졌어요! 내 땅에서 다시 시작해요", warning: false, center: String(left) };
        }
        if (this.board.grid.tailCount(mine.index) >= TerritoryHudBuilder.LONG_TAIL)
            return { banner: TerritoryHudBuilder.LONG_TAIL_MESSAGE, warning: true, center: "" };
        if (now - this.startAt < TerritoryHudBuilder.START_HINT_MS)
            return { banner: TerritoryHudBuilder.START_HINT, warning: false, center: "" };
        return { banner: "", warning: false, center: "" };
    }
}
TerritoryHudBuilder.SPECTATOR_MESSAGE = "관전 중 · 다음 종목부터 함께해요";
TerritoryHudBuilder.LONG_TAIL = 10;
TerritoryHudBuilder.LONG_TAIL_MESSAGE = "꼬리가 길어요! 내 땅으로 돌아오면 둘러싼 땅이 내 것이 돼요";
TerritoryHudBuilder.START_HINT_MS = 7000;
TerritoryHudBuilder.START_HINT = "내 땅 밖으로 나가 크게 한 바퀴 돌아오세요";
class TerritoryGame extends MiniGame {
    constructor(context) {
        super(context);
        this.outbox = new TerritoryOutbox();
        this.inbox = new TerritoryTurnInbox();
        this.lastFlushAt = 0;
        this.lastSequence = 0;
        this.concluded = false;
        this.board = new TerritoryBoard(context.participants.map((participant) => participant.id), context.seed);
        this.stage = new TerritoryScene(context.libs);
        this.tiles = new TerritoryTiles(context.libs, this.stage.world, new TerritoryColors(context.libs, context.participants));
        this.tiles.showAll(this.board.grid);
        this.camera = new TerritoryCamera(this.stage.camera, context.env);
        this.bursts = new TerritoryBursts(context.libs, this.stage.world);
        const kit = new FighterViewKit(context.libs, context.page, new NameTagFactory(context.libs, context.page));
        this.views = new TerritoryRunnerViews(kit, context.characters.factory, context.characters.assets, this.stage.world, this.bursts);
        this.views.build(this.board, context.participants, context.looks, context.localId);
        this.wire = new TerritoryWire(context.wire);
        this.sender = new TerritoryTurnSender(this.wire, context.localId);
        this.pilots = new TerritoryPilots(context.participants, new MathRandomSource());
        this.referee = new TerritoryReferee(context.host, context.startAt, this.board, this.pilots, this);
        this.hudBuilder = new TerritoryHudBuilder(context.localId, context.startAt, context.participants, this.board);
        this.handlers = TerritoryWire.handlers(this);
    }
    streams() {
        return TerritoryWire.streams();
    }
    controls() {
        return { stick: false, turnActions: true, buttons: [] };
    }
    startAt() {
        return this.context.startAt;
    }
    tick(dt, draw) {
        const now = this.context.clock.now();
        this.referee.step(now);
        this.flushIfDue(now);
        if (draw)
            this.draw(now, dt);
    }
    perform(action) {
        const direction = TerritoryDirections.fromName(action.replace("turn:", ""));
        const mine = this.board.playerById(this.context.localId);
        if (direction === null || !mine)
            return;
        if (this.context.host.isHost())
            mine.queueTurn(direction);
        else
            this.sender.send(direction);
    }
    spectateNext() {
        return;
    }
    receive(stream, key, value) {
        const handler = this.handlers[stream];
        if (handler)
            handler(key, value);
    }
    receiveDelta(value) {
        const delta = TerritoryRecords.delta(value, this.board.players.length, this.board.grid);
        if (!delta)
            return;
        this.outbox.adoptSequence(delta.seq);
        if (this.context.host.isHost() || delta.seq <= this.lastSequence)
            return;
        this.lastSequence = delta.seq;
        delta.cells.forEach((cell) => this.board.grid.setCode(cell.index, cell.code));
        delta.players.forEach((state, index) => this.board.restorePlayer(index, state, delta.tick));
        this.board.jumpToTick(Math.max(this.board.tick, delta.tick));
        this.tiles.paint(this.board.grid.drainChanges(), this.context.clock.now());
    }
    receiveTurn(key, value) {
        const record = TerritoryRecords.turn(value);
        if (!record || !this.inbox.accept(key, record.n) || !this.context.host.isHost() || key === this.context.localId)
            return;
        const player = this.board.playerById(key);
        if (player)
            player.queueTurn(record.direction);
    }
    stepped(report, changes) {
        this.outbox.noteChanges(changes);
        this.tiles.paint(changes, this.context.clock.now());
    }
    playerDeparted(id) {
        this.pilots.markDeparted(id);
    }
    isOver() {
        return this.context.clock.now() >= this.context.startAt + TerritoryRules.GAME_MS + TerritoryRules.END_GRACE_MS;
    }
    ranking() {
        return TerritoryStandings.ranking(this.board);
    }
    hud(now) {
        return this.hudBuilder.build(now);
    }
    conclude() {
        this.concluded = true;
    }
    dispose() {
        this.concluded = true;
        this.views.clear();
        this.bursts.clear();
        this.tiles.dispose();
        this.stage.releaseMaterials();
    }
    flushIfDue(now) {
        if (!this.context.host.isHost() || this.concluded || now - this.lastFlushAt < TerritoryRules.NET_MS)
            return;
        if (!this.outbox.hasNews(this.board.tick))
            return;
        this.lastFlushAt = now;
        this.wire.publishDelta(this.outbox.flush(this.board));
    }
    draw(now, dt) {
        const sinceTick = now - (this.context.startAt + this.board.tick * TerritoryRules.STEP_MS);
        const progress = now < this.context.startAt ? 0 : MathUtil.clamp(sinceTick / TerritoryRules.STEP_MS, 0, 1);
        this.views.update(this.board, progress, now, dt);
        this.bursts.update(now);
        this.tiles.update(now);
        if (this.localParticipates())
            this.camera.follow(dt, this.views.focusOf(this.context.localId));
        else
            this.camera.overhead();
        this.context.render.render(this.stage.scene, this.stage.camera);
    }
}
class TerritoryDemoPlayers {
    static build() {
        return TerritoryDemoPlayers.NAMES.map((nick, slot) => ({ id: "demo" + slot, nick, ai: true, slot }));
    }
}
TerritoryDemoPlayers.NAMES = ["a", "b", "c", "d", "e", "f"];
class TerritoryBackdrop extends GameBackdrop {
    constructor(context) {
        super();
        this.context = context;
        this.markers = [];
        this.participants = TerritoryDemoPlayers.build();
        this.stepClock = 0;
        const THREE = context.libs.THREE;
        this.stage = new TerritoryScene(context.libs);
        this.camera = new TerritoryCamera(this.stage.camera, context.env);
        this.tiles = new TerritoryTiles(context.libs, this.stage.world, new TerritoryColors(context.libs, this.participants));
        this.pilots = new TerritoryPilots(this.participants, new MathRandomSource());
        this.board = this.newBoard();
        this.tiles.showAll(this.board.grid);
        this.participants.forEach((participant) => {
            const marker = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: Palette.slotColor(participant.slot) }));
            this.stage.world.add(marker);
            this.markers.push(marker);
        });
    }
    render(dt) {
        const now = this.context.clock.now();
        this.stepClock += dt * 1000 * TerritoryBackdrop.DEMO_SPEED;
        while (this.stepClock >= TerritoryRules.STEP_MS) {
            this.stepClock -= TerritoryRules.STEP_MS;
            this.stepDemo(now);
        }
        this.placeMarkers(this.stepClock / TerritoryRules.STEP_MS);
        this.tiles.update(now);
        this.camera.showcase(dt);
        this.context.render.render(this.stage.scene, this.stage.camera);
    }
    dispose() {
        this.tiles.dispose();
        this.markers.forEach((marker) => {
            marker.geometry.dispose();
            marker.material.dispose();
        });
        this.stage.releaseMaterials();
    }
    newBoard() {
        return new TerritoryBoard(this.participants.map((participant) => participant.id), this.context.clock.now() % 1000003);
    }
    stepDemo(now) {
        if (this.board.tick >= TerritoryRules.TOTAL_TICKS) {
            this.board = this.newBoard();
            this.tiles.showAll(this.board.grid);
            return;
        }
        this.pilots.steer(this.board);
        this.board.advance();
        this.tiles.paint(this.board.grid.drainChanges(), now);
    }
    placeMarkers(progress) {
        this.board.players.forEach((player) => {
            const marker = this.markers[player.index];
            marker.visible = player.alive;
            marker.position.set(TerritoryLook.worldX(player.x) + TerritoryDirections.DX[player.dir] * progress, 0.9, TerritoryLook.worldZ(player.y) + TerritoryDirections.DY[player.dir] * progress);
        });
    }
}
TerritoryBackdrop.DEMO_SPEED = 2.2;
class TerritoryDefinition extends GameDefinition {
    constructor() {
        super(...arguments);
        this.id = "territory";
        this.title = "땅따먹기";
        this.summary = "땅 밖으로 나가 크게 둘러싸서 땅을 넓히는 1분 개인전";
        this.keyHelp = [
            { keys: ["W", "A", "S", "D", "↑", "←", "↓", "→"], text: "방향 바꾸기 (뒤로는 못 돌아요)" },
            { keys: ["태블릿"], text: "화면을 밀어서(스와이프) 가고 싶은 방향으로 돌기" }
        ];
        this.rules = [
            "항상 앞으로 달리고 <b>방향만 바꿔요.</b> 자기 땅 밖으로 나가면 지나간 칸에 <b>꼬리</b>가 남아요.",
            "꼬리를 그리다 <b>내 땅으로 돌아오면</b> 꼬리와 둘러싼 안쪽이 모두 내 땅! 남의 땅도 그대로 빼앗아요.",
            "<b>누가 내 꼬리를 밟으면 쓰러져요.</b> 내 꼬리를 내가 밟거나 벽에 부딪혀도 쓰러져요. 3초 뒤 내 땅에서 다시 시작해요.",
            "60초 뒤 <b>땅이 가장 넓은 순서</b>로 순위가 정해져요. 멀리 나가 크게 둘러싸거나, 남의 꼬리를 노려 보세요."
        ];
    }
    preload() {
        return Promise.resolve();
    }
    create(context) {
        return new TerritoryGame(context);
    }
    createBackdrop(context) {
        return new TerritoryBackdrop(context);
    }
}
