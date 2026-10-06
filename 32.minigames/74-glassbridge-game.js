"use strict";
class GlassBridgePanelView {
    constructor(page, elements, env, listener) {
        this.page = page;
        this.listener = listener;
        this.signature = "";
        this.alive = true;
        this.root = page.byId("gbPanel");
        this.root.innerHTML = "";
        this.hint = elements.create("div");
        this.hint.className = "gbHint";
        this.bagRow = elements.create("div");
        this.bagRow.className = "gbBags";
        this.sideRow = elements.create("div");
        this.sideRow.className = "gbSides";
        this.left = this.sideButton(elements, 0, "◀ 왼쪽", "1");
        this.right = this.sideButton(elements, 1, "오른쪽 ▶", "2");
        this.sideRow.appendChild(this.left);
        this.sideRow.appendChild(this.right);
        this.bagRow.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-bag]");
            if (button && !button.disabled && button.dataset.bag)
                this.listener.onBag(+button.dataset.bag);
        });
        this.root.appendChild(this.hint);
        this.root.appendChild(this.bagRow);
        this.root.appendChild(this.sideRow);
        env.onKeyDown((key) => this.handleKey(key));
    }
    render(model) {
        const signature = JSON.stringify(model);
        if (signature === this.signature)
            return;
        this.signature = signature;
        this.page.show(this.root, model.visible);
        this.page.setText(this.hint, model.hint);
        this.page.show(this.bagRow, model.bags !== null);
        this.page.show(this.sideRow, model.sidesVisible);
        this.left.disabled = !model.leftEnabled;
        this.right.disabled = !model.rightEnabled;
        if (model.bags) {
            this.bagRow.innerHTML = model.bags.map((bag, index) => "<button type='button' class='gbBag" + (bag.taken ? " taken" : "") + "' data-bag='" + index + "'" + (bag.taken || !model.canPickBag ? " disabled" : "") + "><b>" + Html.escape(bag.label) + "</b></button>").join("");
        }
    }
    dispose() {
        this.alive = false;
        this.root.innerHTML = "";
        this.page.show(this.root, false);
    }
    sideButton(elements, side, label, hotkey) {
        const button = elements.create("button");
        button.type = "button";
        button.className = "gbSide";
        button.innerHTML = "<span>" + label + "</span><kbd>" + hotkey + "</kbd>";
        button.addEventListener("click", () => this.listener.onSide(side));
        return button;
    }
    handleKey(key) {
        if (!this.alive || key.inTextField || key.repeat)
            return;
        const digit = GlassBridgePanelView.DIGIT_CODE.exec(key.code);
        if (digit) {
            key.preventDefault();
            this.listener.onBag(+digit[1] - 1);
            if (digit[1] === "1")
                this.listener.onSide(0);
            else if (digit[1] === "2")
                this.listener.onSide(1);
        }
        else if (GlassBridgePanelView.LEFT_CODES.indexOf(key.code) >= 0) {
            key.preventDefault();
            this.listener.onSide(0);
        }
        else if (GlassBridgePanelView.RIGHT_CODES.indexOf(key.code) >= 0) {
            key.preventDefault();
            this.listener.onSide(1);
        }
    }
}
GlassBridgePanelView.DIGIT_CODE = /^(?:Digit|Numpad)([1-9])$/;
GlassBridgePanelView.LEFT_CODES = ["ArrowLeft", "KeyA"];
GlassBridgePanelView.RIGHT_CODES = ["ArrowRight", "KeyD"];
class GlassBridgePicker {
    constructor(libs, canvas, camera, bagGroups, choiceRow, listener) {
        this.libs = libs;
        this.canvas = canvas;
        this.camera = camera;
        this.bagGroups = bagGroups;
        this.choiceRow = choiceRow;
        this.listener = listener;
        this.handler = (event) => this.pick(event);
        const THREE = libs.THREE;
        this.raycaster = new THREE.Raycaster();
        this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.bagLevel = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GlassBridgePicker.BAG_PLANE_Y);
        this.spot = new THREE.Vector3();
        canvas.addEventListener("pointerdown", this.handler);
    }
    dispose() {
        this.canvas.removeEventListener("pointerdown", this.handler);
    }
    pick(event) {
        const bounds = this.canvas.getBoundingClientRect();
        const ndc = new this.libs.THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
        this.raycaster.setFromCamera(ndc, this.camera);
        const bags = this.bagGroups();
        if (bags.length) {
            const index = this.bagIndexAt(bags);
            if (index < 0)
                return;
            event.preventDefault();
            this.listener.onBag(index);
            return;
        }
        const row = this.choiceRow();
        if (row === null || !this.raycaster.ray.intersectPlane(this.ground, this.spot))
            return;
        const insideRow = Math.abs(this.spot.z - GlassBridgeLayout.rowZ(row)) <= GlassBridgeLayout.ROW_LENGTH / 2 + GlassBridgePicker.ROW_MARGIN;
        const insideBridge = Math.abs(this.spot.x) <= GlassBridgeLayout.SIDE_OFFSET + GlassBridgePicker.SIDE_MARGIN;
        if (!insideRow || !insideBridge)
            return;
        event.preventDefault();
        this.listener.onSide(this.spot.x < 0 ? 0 : 1);
    }
    bagIndexAt(bags) {
        const hits = this.raycaster.intersectObjects(bags.slice(), true);
        for (const hit of hits) {
            let node = hit.object;
            while (node) {
                const index = bags.indexOf(node);
                if (index >= 0)
                    return index;
                node = node.parent;
            }
        }
        if (!this.raycaster.ray.intersectPlane(this.bagLevel, this.spot))
            return -1;
        let best = -1;
        let bestDistance = GlassBridgePicker.BAG_REACH;
        bags.forEach((bag, index) => {
            const distance = MathUtil.distance(this.spot.x, this.spot.z, bag.position.x, bag.position.z);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = index;
            }
        });
        return best;
    }
}
GlassBridgePicker.BAG_REACH = 1.3;
GlassBridgePicker.BAG_PLANE_Y = 0.6;
GlassBridgePicker.ROW_MARGIN = 0.2;
GlassBridgePicker.SIDE_MARGIN = 1.2;
class GlassBridgeHudBuilder {
    constructor(match, localId, cursor) {
        this.match = match;
        this.localId = localId;
        this.cursor = cursor;
    }
    build(now, spectating) {
        const endAt = this.match.endAt();
        const entries = this.match.standings(Math.min(now, endAt === null ? now : endAt)).entries();
        return {
            rows: entries.map((entry) => this.rowOf(entry, now)),
            viewTargets: spectating ? this.match.participants.map((participant) => ({ id: participant.id, nick: participant.nick, slot: participant.slot, ai: participant.ai, out: false })) : [],
            viewingId: this.cursor.watched(),
            summary: this.summary(now),
            clock: this.clockText(now, endAt),
            footer: this.footer(),
            cooldowns: [],
            bannerHtml: this.banner(now),
            bannerWarning: this.warning(now),
            centerText: now < this.match.startAt ? String(Math.max(1, Math.ceil((this.match.startAt - now) / 1000))) : "",
            spectateButton: spectating
        };
    }
    rowOf(entry, now) {
        const participant = this.match.participant(entry.id);
        return { id: entry.id, nick: participant.nick, slot: participant.slot, ai: participant.ai, dead: false, detail: this.detail(entry, now) };
    }
    detail(entry, now) {
        const timeline = this.match.timeline();
        if (!timeline) {
            const draw = this.match.lottery.drawOf(entry.id);
            return draw ? draw.n + "번" : "뽑는 중";
        }
        const track = timeline.trackOf(entry.id);
        if (track.hasArrived(now))
            return "도착 " + track.arrivalNumber + "위 · 추락 " + entry.falls;
        if (timeline.leader() === entry.id)
            return "선두 " + entry.rows + "칸 · 추락 " + entry.falls;
        return "뒤따름 " + entry.rows + "칸 · 추락 " + entry.falls;
    }
    summary(now) {
        const timeline = this.match.timeline();
        if (!this.match.participant(this.localId))
            return "";
        if (!timeline) {
            const draw = this.match.lottery.drawOf(this.localId);
            return draw ? "내 순서 " + draw.n + "번" : "주머니를 뽑아요";
        }
        const mine = this.match.standings(now).entries().find((entry) => entry.id === this.localId);
        return mine ? "추락 " + mine.falls + "회" : "";
    }
    footer() {
        const timeline = this.match.timeline();
        return timeline ? "공개된 칸 " + timeline.panels.knownCount() + " / " + this.match.rows : "";
    }
    clockText(now, endAt) {
        const left = endAt === null ? GlassBridgeRules.PLAY_MS : MathUtil.clamp(endAt - now, 0, GlassBridgeRules.PLAY_MS);
        const seconds = Math.ceil(left / 1000);
        return Math.floor(seconds / 60) + ":" + ("0" + seconds % 60).slice(-2);
    }
    warning(now) {
        const timeline = this.match.timeline();
        const choiceWindow = timeline ? timeline.openWindow() : null;
        return choiceWindow !== null && now >= choiceWindow.opensAt && choiceWindow.closesAt - now < 1000;
    }
    banner(now) {
        if (now < this.match.startAt)
            return "";
        const timeline = this.match.timeline();
        if (!timeline) {
            const left = Math.max(0, Math.ceil((this.match.startAt + GlassBridgeRules.LOTTERY_MS - now) / 1000));
            return this.match.lottery.hasDrawn(this.localId) || !this.match.participant(this.localId) ? "순서 뽑는 중 · " + left + "초" : "<b>주머니를 하나 뽑으세요</b> · " + left + "초";
        }
        if (timeline.isFinished())
            return now >= timeline.lastArrival() ? "<b>전원 도착!</b>" : "";
        const choiceWindow = timeline.openWindow();
        if (!choiceWindow || now < choiceWindow.opensAt)
            return "";
        const participant = this.match.participant(choiceWindow.id);
        const left = Math.max(0, (choiceWindow.closesAt - now) / 1000).toFixed(1);
        return "<b>" + Html.escape(participant.nick) + "</b> 차례 · 새 칸 선택 " + left + "초";
    }
}
class GlassBridgeGame extends MiniGame {
    constructor(context, assets) {
        super(context);
        this.concluded = false;
        this.match = new GlassBridgeMatch(context.participants, context.seed, context.startAt, GlassBridgeRules.ROW_COUNT);
        this.referee = new GlassBridgeReferee(this.match, context.host, new RandomRange(new MathRandomSource()), this);
        this.wire = new GlassBridgeWire(context.wire, context.localId);
        this.local = new GlassBridgeLocalPlayer(context.localId, this.match, this);
        this.cursor = new SpectatorCursor(context.localId);
        this.hudBuilder = new GlassBridgeHudBuilder(this.match, context.localId, this.cursor);
        this.handlers = GlassBridgeWire.handlers(this.match);
        this.stage = new GlassBridgeStage(context.libs, context.page, context.env, assets, context.characters, this.match, context.looks, context.localId, true);
        this.panel = new GlassBridgePanelView(context.page, new ElementFactory(), context.env, this);
        this.picker = new GlassBridgePicker(context.libs, context.page.byId("view"), this.stage.camera, () => this.pickableBags(), () => this.pickableRow(), this);
    }
    streams() {
        return GlassBridgeWire.streams();
    }
    controls() {
        return { stick: false, buttons: [] };
    }
    startAt() {
        return this.context.startAt;
    }
    tick(dt, draw) {
        const now = this.context.clock.now();
        this.match.sync();
        if (!this.concluded)
            this.referee.step(now);
        if (draw)
            this.draw(now, dt);
    }
    perform(action) {
        return;
    }
    spectateNext() {
        this.cursor.cycle(this.match.ids());
    }
    spectateTo(id) {
        this.cursor.select(id, this.match.ids());
    }
    receive(stream, key, value) {
        const handler = this.handlers[stream];
        if (handler)
            handler(key, value);
    }
    playerDeparted(id) {
        this.match.markDeparted(id);
    }
    isOver() {
        return this.match.isOver(this.context.clock.now());
    }
    ranking() {
        const endAt = this.match.endAt();
        return this.match.standings(endAt === null ? this.context.clock.now() : endAt).ranking();
    }
    resultNotes() {
        return this.match.resultNotes();
    }
    hud(now) {
        return this.hudBuilder.build(now, !this.local.participates() || this.isLocalSafe(now));
    }
    conclude() {
        this.concluded = true;
    }
    dispose() {
        this.concluded = true;
        this.picker.dispose();
        this.panel.dispose();
        this.stage.dispose();
    }
    sendDraw(record) {
        this.wire.sendDraw(record);
    }
    sendStep(record) {
        this.wire.sendStep(record);
    }
    requestBag(record) {
        this.wire.requestBag(record);
    }
    sendPick(key, record) {
        this.wire.sendPick(key, record);
    }
    onBag(index) {
        this.local.chooseBag(index);
    }
    onSide(side) {
        this.local.chooseSide(side, this.context.clock.now());
    }
    pickableBags() {
        return this.match.timeline() === null && this.local.participates() ? this.stage.bagGroups() : [];
    }
    pickableRow() {
        const choiceWindow = this.local.myWindow(this.context.clock.now());
        return choiceWindow ? choiceWindow.row : null;
    }
    isLocalSafe(now) {
        const timeline = this.match.timeline();
        return timeline !== null && timeline.trackOf(this.context.localId).hasArrived(now);
    }
    draw(now, dt) {
        this.stage.update(this.match, now, dt);
        this.aimCamera(now, dt);
        this.panel.render(this.panelModel(now));
        this.context.render.render(this.stage.scene, this.stage.camera);
    }
    aimCamera(now, dt) {
        const rig = this.stage.cameraRig;
        const timeline = this.match.timeline();
        if (!timeline) {
            rig.lottery(dt);
            return;
        }
        const watched = this.cursor.watched();
        const target = watched !== null && (!this.local.participates() || this.isLocalSafe(now)) ? watched : timeline.leader();
        const position = target ? this.stage.contestants.positionOf(target) : null;
        if (position)
            rig.follow(dt, position.x, position.z);
        else
            rig.overview(dt);
    }
    panelModel(now) {
        if (!this.local.participates() || now < this.match.startAt)
            return { visible: false, hint: "", bags: null, canPickBag: false, sidesVisible: false, leftEnabled: false, rightEnabled: false };
        const timeline = this.match.timeline();
        if (!timeline)
            return this.lotteryModel();
        const choiceWindow = timeline.openWindow();
        const mine = choiceWindow !== null && choiceWindow.id === this.context.localId;
        const open = mine && this.local.myWindow(now) !== null;
        const hint = open ? "깨지지 않을 유리를 클릭 (1 · ← · A = 왼쪽 / 2 · → · D = 오른쪽)" : mine ? "건너는 중…" : "";
        return { visible: mine, hint, bags: null, canPickBag: false, sidesVisible: mine, leftEnabled: open && this.local.canChooseSide(0, now), rightEnabled: open && this.local.canChooseSide(1, now) };
    }
    lotteryModel() {
        const lottery = this.match.lottery;
        const mine = lottery.drawOf(this.context.localId);
        const bags = Array.from({ length: lottery.bagCount() }, (unused, index) => {
            const owner = lottery.bagOwner(index);
            const draw = owner ? lottery.drawOf(owner) : null;
            return { taken: owner !== null, label: draw ? draw.n + "번" : String(index + 1) };
        });
        return { visible: true, hint: mine ? "내 순서는 " + mine.n + "번이에요" : "주머니를 클릭해 순서를 뽑아요", bags, canPickBag: mine === null, sidesVisible: false, leftEnabled: false, rightEnabled: false };
    }
}
class GlassBridgeBackdrop extends GameBackdrop {
    constructor(context, assets, characters) {
        super();
        this.context = context;
        this.assets = assets;
        this.characters = characters;
        this.page = new Page();
        this.random = new RandomRange(new MathRandomSource());
        this.startedAt = 0;
        this.match = this.createMatch();
        this.referee = this.createReferee();
        this.stage = this.createStage();
    }
    render(dt) {
        const now = this.context.clock.now();
        this.referee.step(now);
        this.match.sync();
        this.stage.update(this.match, now, dt);
        this.stage.cameraRig.showcase(dt);
        this.context.render.render(this.stage.scene, this.stage.camera);
        if (this.match.isOver(now) || now - this.startedAt > GlassBridgeBackdrop.ROUND_LIMIT_MS)
            this.restart();
    }
    dispose() {
        this.stage.dispose();
    }
    restart() {
        this.stage.dispose();
        this.match = this.createMatch();
        this.referee = this.createReferee();
        this.stage = this.createStage();
    }
    createMatch() {
        const participants = GlassBridgeBackdrop.DEMO_NAMES.map((nick, slot) => ({ id: "demo" + slot, nick, ai: true, slot }));
        this.startedAt = this.context.clock.now();
        return new GlassBridgeMatch(participants, Math.floor(this.random.next() * 1e9), this.startedAt + 300, GlassBridgeRules.ROW_COUNT);
    }
    createReferee() {
        return new GlassBridgeReferee(this.match, { isHost: () => true }, this.random, new GlassBridgeSilentSink());
    }
    createStage() {
        const looks = new Map();
        this.match.participants.forEach((participant) => looks.set(participant.id, CharacterLooks.random()));
        return new GlassBridgeStage(this.context.libs, this.page, this.context.env, this.assets, this.characters, this.match, looks, "", false);
    }
}
GlassBridgeBackdrop.DEMO_NAMES = ["a", "b", "c", "d", "e", "f"];
GlassBridgeBackdrop.ROUND_LIMIT_MS = 70000;
class GlassBridgeDefinition extends GameDefinition {
    constructor(libs, characters, factory) {
        super();
        this.characters = characters;
        this.factory = factory;
        this.id = "glassbridge";
        this.title = "유리다리";
        this.summary = "한 장은 튼튼하고 한 장은 깨지는 유리 15칸을 줄지어 건너는 종목";
        this.keyHelp = [
            { keys: ["클릭"], text: "처음에는 주머니, 건널 때는 밟을 유리 누르기" },
            { keys: ["1", "←", "A"], text: "왼쪽 유리 밟기" },
            { keys: ["2", "→", "D"], text: "오른쪽 유리 밟기" },
            { keys: ["태블릿"], text: "주머니나 유리를 터치하거나 화면 아래 왼쪽·오른쪽 단추 누르기" }
        ];
        this.rules = [
            "먼저 <b>주머니</b>를 하나씩 눌러 건너는 <b>순서</b>를 뽑아요. 8초 안에 못 뽑으면 남은 번호가 정해져요.",
            "모두 한 줄로 다리에 올라요. 맨 앞 사람이 새 칸을 밟으면 뒷사람이 한 칸씩 따라와요. 한 칸마다 유리 두 장 중 <b>한 장은 깨지고</b>, 앞사람만 6초 안에 <b>밟을 유리를 눌러</b> 골라요. 못 고르면 떨어져요.",
            "누군가 밟은 칸은 <b>두 장 모두 공개</b>돼요. 앞사람이 떨어지면 다음 사람이 공개된 칸을 빠르게 지나 맨 앞에 서고, 떨어진 사람은 줄 맨 뒤로 가요.",
            "<b>2분 30초</b> 안에 도착한 순서대로 순위가 정해져요. 못 건넜으면 더 멀리 간 사람이 앞이에요."
        ];
        this.assets = new GlassBridgeAssets(libs, characters);
    }
    preload() {
        return this.assets.load();
    }
    create(context) {
        return new GlassBridgeGame(context, this.assets);
    }
    createBackdrop(context) {
        return new GlassBridgeBackdrop(context, this.assets, { assets: this.characters, factory: this.factory });
    }
}
