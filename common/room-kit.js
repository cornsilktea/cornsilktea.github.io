"use strict";
class RkDom {
    static byId(id) {
        return document.getElementById(id);
    }
    static show(element, visible) {
        element.hidden = !visible;
    }
    static setText(element, text) {
        if (element.textContent !== text)
            element.textContent = text;
    }
    static escape(text) {
        const table = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
        return String(text).replace(/[&<>"]/g, (character) => table[character]);
    }
}
class RkBackend {
    constructor() {
        this.database = null;
        this.serverOffset = 0;
        const config = window.PORTAL_CONFIG;
        try {
            if (window.firebase && config && config.isReady()) {
                window.firebase.initializeApp({ apiKey: config.API_KEY, authDomain: config.AUTH_DOMAIN, databaseURL: config.DB_URL.replace(/\/+$/, "") });
                this.database = window.firebase.database();
            }
        }
        catch (error) {
            this.database = null;
        }
        if (this.database) {
            this.database.ref(".info/serverTimeOffset").on("value", (snapshot) => {
                this.serverOffset = snapshot.val() || 0;
            });
        }
    }
    now() {
        return Date.now() + this.serverOffset;
    }
    databaseUrl() {
        return window.PORTAL_CONFIG ? window.PORTAL_CONFIG.DB_URL.replace(/\/+$/, "") : "";
    }
}
class RkLabelFactory {
    constructor(libs) {
        this.libs = libs;
    }
    create(text, color) {
        const THREE = this.libs.THREE;
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        const context = canvas.getContext("2d");
        context.font = '800 34px "Nanum Gothic", "Malgun Gothic", sans-serif';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineJoin = "round";
        context.lineWidth = 8;
        context.strokeStyle = "rgba(10,12,20,.85)";
        context.strokeText(text, 128, 34, 232);
        context.fillStyle = color;
        context.fillText(text, 128, 34, 232);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
        sprite.scale.set(2.6, 0.65, 1);
        return sprite;
    }
}
class RkSeatPlan {
    constructor(rules) {
        this.rules = rules;
    }
    humanSeats(players) {
        const seats = [];
        for (let slot = 0; slot < this.rules.seatCount; slot++)
            seats.push(null);
        players.forEach((record, id) => {
            if (!record.isBot && !record.spectator && record.slot >= 0 && record.slot < this.rules.seatCount)
                seats[record.slot] = id;
        });
        return seats;
    }
    spectators(players) {
        const ids = [];
        players.forEach((record, id) => { if (record.spectator)
            ids.push(id); });
        return ids;
    }
    freeSeat(players) {
        const seats = this.humanSeats(players);
        if (!this.rules.seatOrder)
            return seats.indexOf(null);
        const open = this.rules.seatOrder.find((slot) => seats[slot] === null);
        return open === undefined ? -1 : open;
    }
    swapUpdates(players, first, second) {
        const seats = this.humanSeats(players);
        const updates = {};
        if (seats[first])
            updates["players/" + seats[first] + "/slot"] = second;
        if (seats[second])
            updates["players/" + seats[second] + "/slot"] = first;
        return updates;
    }
    matchSeats(match) {
        const seats = [];
        for (let slot = 0; slot < this.rules.seatCount; slot++)
            seats.push(match && match.seats ? match.seats["s" + slot] || null : null);
        return seats;
    }
}
/* 새로고침·탭 복원 뒤 같은 방·같은 아이디로 돌아오는 규칙(모든 매칭 게임 공통). 게임은 두 줄만 쓴다:
   myId 를 RkReloadResume.identity(규칙) 로 만들고, 에셋을 다 불러온 뒤 RkReloadResume.rejoinCode(백엔드, 규칙) 가 코드를 주면 enterRoom(code, false, "") 한다.
   저장·지우기·경기 중 자리 유지는 RkSession 이 알아서 한다. */
class RkReloadResume {
    static store(rules) {
        return new RoomResumeStore(rules.root);
    }
    static identity(rules) {
        return RkReloadResume.store(rules).identity();
    }
    /* 에셋을 다 불러온 직후 한 줄로 부른다: 저장된 방이 남아 있으면 enter(코드)로 다시 들어간다. 실패해도 시작 화면은 그대로 쓸 수 있다. */
    static resumeInto(backend, rules, enter) {
        RkReloadResume.rejoinCode(backend, rules).then((code) => { if (code)
            enter(code); }).catch(() => RkReloadResume.store(rules).clear());
    }
    static async rejoinCode(backend, rules) {
        const store = RkReloadResume.store(rules);
        if (!backend.database || !store.read())
            return null;
        const code = await store.rejoin(backend.database, rules.root);
        if (!code)
            store.clear();
        return code;
    }
}
class RkSession {
    constructor(backend, rules, code, myId, hosting, valueNames) {
        this.rules = rules;
        this.code = code;
        this.myId = myId;
        this.hosting = hosting;
        this.valueNames = valueNames;
        this.pendingRemovals = new Map();
        this.lastStates = new Map();
        this.players = new Map();
        this.values = new Map();
        this.hostId = null;
        this.hostLoaded = false;
        this.status = "lobby";
        this.onChange = () => undefined;
        this.onRemoteState = () => undefined;
        this.onPress = () => undefined;
        this.onPlayerRemoved = () => undefined;
        this.onClosed = () => undefined;
        this.onHostTakeover = () => undefined;
        this.subscriptions = [];
        this.leaving = false;
        this.ref = backend.database.ref(rules.root + "/" + code);
        this.database = backend.database;
        this.resume = RkReloadResume.store(rules);
        this.succession = new RoomHostSuccession({
            myId: () => this.myId,
            players: () => this.players,
            hostId: () => this.hostId,
            hostLoaded: () => this.hostLoaded,
            leaving: () => this.leaving,
            ref: () => this.ref
        });
        this.dropRecovery = new RoomDropRecovery({
            myId: () => this.myId,
            room: () => this.ref,
            leaving: () => this.leaving,
            exit: (message) => this.onClosed(message),
            subscribe: (ref, event, listener) => this.subscribe(ref, event, listener),
            returnRecord: (saved) => saved,
            afterReturn: () => { this.armDisconnect(); this.onChange("players"); }
        }, this.database, ["players", "st", "in"]);
    }
    value(name) {
        const value = this.values.get(name);
        return value === undefined ? null : value;
    }
    isHost() {
        return this.hostId === this.myId;
    }
    me() {
        return this.players.get(this.myId) || null;
    }
    isSpectator() {
        const record = this.me();
        return !!record && !!record.spectator;
    }
    connect() {
        this.armDisconnect();
        this.resume.keepFresh(() => (this.leaving ? null : { code: this.code, myId: this.myId, record: this.mineAsRecord() }));
        this.subscribe(this.database.ref(".info/connected"), "value", (snapshot) => {
            if (snapshot.val() === true && !this.leaving)
                this.armDisconnect();
        });
        const playersRef = this.ref.child("players");
        this.subscribe(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
        this.subscribe(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
        this.subscribe(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
        this.watchValue("hostPlayerId", (value) => {
            const before = this.hostId;
            this.hostId = value || null;
            this.hostLoaded = true;
            this.succession.check();
            if (before !== null && before !== this.myId && this.hostId === this.myId && this.status !== "lobby")
                this.onHostTakeover();
            this.onChange("host");
        });
        this.watchValue("status", (value) => {
            if (value === null) {
                if (!this.leaving)
                    this.onClosed("방이 종료되었어요.");
                return;
            }
            this.status = value;
            this.onChange("status");
        });
        this.valueNames.forEach((name) => {
            this.watchValue(name, (value) => {
                this.values.set(name, value);
                this.onChange(name);
            });
        });
        const stateRef = this.ref.child("st");
        const onState = (snapshot) => {
            const raw = snapshot.val();
            if (typeof raw === "string" && snapshot.key !== this.myId) {
                this.lastStates.set(snapshot.key, raw);
                this.onRemoteState(snapshot.key, raw);
            }
        };
        this.subscribe(stateRef, "child_added", onState);
        this.subscribe(stateRef, "child_changed", onState);
        const pressRef = this.ref.child("in");
        const onPressSnapshot = (snapshot) => {
            const record = snapshot.val();
            if (record && snapshot.key !== this.myId)
                this.onPress(snapshot.key, record);
        };
        this.subscribe(pressRef, "child_added", onPressSnapshot);
        this.subscribe(pressRef, "child_changed", onPressSnapshot);
    }
    pushProfile(record) {
        if (this.players.has(this.myId))
            this.ref.child("players/" + this.myId).update({ nick: record.nick, look: record.look });
    }
    writeState(raw, id = this.myId) {
        this.ref.child("st/" + id).set(raw);
    }
    writePress(record) {
        this.ref.child("in/" + this.myId).set(record);
    }
    writeValue(name, value) {
        this.ref.child(name).set(value);
    }
    /* 경기 화면이 늦게 만들어져 놓친 다른 사람들의 마지막 위치를 다시 넣어 준다(새로고침한 사람이 모두 시작 위치로 보이는 것을 막는다). */
    replayStates() {
        this.lastStates.forEach((raw, id) => this.onRemoteState(id, raw));
    }
    mineAsRecord() {
        return this.players.get(this.myId) || null;
    }
    saveResume() {
        this.resume.save(this.code, this.myId, this.mineAsRecord());
    }
    forgetResume() {
        this.resume.clear();
        this.pendingRemovals.forEach((timer) => window.clearTimeout(timer));
        this.pendingRemovals.clear();
    }
    leave() {
        this.forgetResume();
        this.leaving = true;
        this.unsubscribeAll();
        this.cancelDisconnect();
        this.succession.cancel();
        if (this.isHost())
            this.succession.handOver();
        this.removeMine();
    }
    silentClose() {
        this.forgetResume();
        this.leaving = true;
        this.succession.cancel();
        this.unsubscribeAll();
        this.cancelDisconnect();
    }
    removeMineOnUnload() {
        this.saveResume();
        if (this.isHost())
            this.succession.handOver();
        this.removeMine();
    }
    removeMine() {
        try {
            this.ref.child("players/" + this.myId).remove();
            this.ref.child("st/" + this.myId).remove();
            this.ref.child("in/" + this.myId).remove();
        }
        catch (error) {
            return;
        }
    }
    cancelDisconnect() {
        try {
            this.ref.child("players/" + this.myId).onDisconnect().cancel();
            this.ref.child("st/" + this.myId).onDisconnect().cancel();
            this.ref.child("in/" + this.myId).onDisconnect().cancel();
        }
        catch (error) {
            return;
        }
    }
    watchValue(path, apply) {
        this.subscribe(this.ref.child(path), "value", (snapshot) => apply(snapshot.val()));
    }
    subscribe(ref, event, listener) {
        ref.on(event, listener);
        this.subscriptions.push({ ref, event, listener });
    }
    unsubscribeAll() {
        this.subscriptions.forEach((entry) => {
            try {
                entry.ref.off(entry.event, entry.listener);
            }
            catch (error) {
                return;
            }
        });
        this.subscriptions = [];
    }
    armDisconnect() {
        this.ref.child("players/" + this.myId).onDisconnect().remove();
        this.ref.child("st/" + this.myId).onDisconnect().remove();
        this.ref.child("in/" + this.myId).onDisconnect().remove();
    }
    setPlayer(snapshot) {
        const record = snapshot.val();
        if (!record)
            return;
        record.look = CharacterLooks.clean(record.look);
        this.players.set(snapshot.key, record);
        this.cancelPendingRemoval(snapshot.key);
        if (snapshot.key === this.myId)
            this.saveResume();
        this.onChange("players");
    }
    cancelPendingRemoval(id) {
        const timer = this.pendingRemovals.get(id);
        if (timer === undefined)
            return;
        window.clearTimeout(timer);
        this.pendingRemovals.delete(id);
    }
    removePlayer(snapshot) {
        if (snapshot.key === this.myId && !this.leaving) {
            this.dropRecovery.recover(snapshot.val() || this.mineAsRecord());
            return;
        }
        const id = snapshot.key;
        const record = this.players.get(id);
        const humanInMatch = !!record && !record.isBot && this.status !== "lobby" && !this.leaving;
        if (!humanInMatch) {
            this.finishRemoval(id);
            return;
        }
        this.cancelPendingRemoval(id);
        this.pendingRemovals.set(id, window.setTimeout(() => {
            this.pendingRemovals.delete(id);
            this.finishRemoval(id);
        }, RkSession.REJOIN_GRACE_MS));
    }
    finishRemoval(id) {
        this.players.delete(id);
        this.lastStates.delete(id);
        this.succession.check();
        this.onPlayerRemoved(id);
        this.onChange("players");
    }
}
/* 경기 중 누가 방에서 사라져도 이 시간 안에 돌아오면 자리를 그대로 둔다(새로고침 복구). 지나면 그때 나간 것으로 처리한다. */
RkSession.REJOIN_GRACE_MS = 20000;
class RkDirectory {
    constructor(backend, rules) {
        this.backend = backend;
        this.rules = rules;
        this.seats = new RkSeatPlan(rules);
    }
    async create(myId, record, extra = {}, taken = async () => false) {
        await this.sweep();
        const database = this.backend.database;
        for (let attempt = 0; attempt < 9; attempt++) {
            const code = String(10000 + Math.floor(Math.random() * 90000));
            if (await taken(code))
                continue;
            const room = Object.assign({}, extra, { status: "lobby", hostPlayerId: myId, createdAt: this.backend.now(), players: { [myId]: record } });
            const result = await database.ref(this.rules.root + "/" + code).transaction((current) => (current !== null ? undefined : room));
            if (result.committed)
                return code;
        }
        return null;
    }
    async join(code, myId, record, asSpectator, useAssigned = false) {
        const room = this.backend.database.ref(this.rules.root + "/" + code);
        const [playersSnapshot, statusSnapshot, assignedSnapshot] = await Promise.all([
            room.child("players").once("value"),
            room.child("status").once("value"),
            useAssigned ? room.child("assign/" + myId).once("value") : Promise.resolve(null)
        ]);
        const players = playersSnapshot.val();
        if (!players || !Object.keys(players).some((id) => !players[id].isBot))
            return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
        const map = new Map(Object.keys(players).map((id) => [id, players[id]]));
        const assigned = assignedSnapshot ? assignedSnapshot.val() : null;
        const seat = assigned !== null && !this.seats.humanSeats(map)[assigned] ? assigned : this.seats.freeSeat(map);
        const lobby = statusSnapshot.val() === "lobby";
        const spectate = asSpectator || !lobby || seat < 0;
        if (spectate) {
            if (this.seats.spectators(map).length >= (this.rules.spectatorLimit || 1))
                return { ok: false, message: "관전 자리가 이미 찼어요. 다음 판에 들어와 주세요." };
            await room.child("players/" + myId).set(Object.assign({}, record, { slot: this.rules.spectatorSlot, spectator: true }));
            const reason = asSpectator ? "" : lobby ? "선수 자리가 가득 차서 관전으로 들어왔어요." : "경기 중이라 관전으로 들어왔어요.";
            return { ok: true, message: reason };
        }
        await room.child("players/" + myId).set(Object.assign({}, record, { slot: seat, spectator: false }));
        return { ok: true, message: "" };
    }
    async sweep() {
        try {
            const base = this.backend.databaseUrl();
            const response = await fetch(base + "/" + this.rules.root + ".json?shallow=true");
            const codes = response.ok ? Object.keys((await response.json()) || {}) : [];
            const now = this.backend.now();
            const database = this.backend.database;
            const updates = {};
            await Promise.all(codes.map(async (code) => {
                const room = database.ref(this.rules.root + "/" + code);
                const [created, players] = await Promise.all([room.child("createdAt").once("value"), room.child("players").once("value")]);
                const age = now - (created.val() || 0);
                const map = players.val() || {};
                const hasHuman = Object.keys(map).some((id) => !map[id].isBot);
                if ((!hasHuman && age > RkDirectory.STALE_EMPTY_MS) || age > RkDirectory.STALE_OLD_MS)
                    updates[code] = null;
            }));
            if (Object.keys(updates).length)
                await database.ref(this.rules.root).update(updates);
        }
        catch (error) {
            return;
        }
    }
}
RkDirectory.STALE_EMPTY_MS = 60000;
RkDirectory.STALE_OLD_MS = 6 * 3600000;
class RkMatchHooks {
    constructor(plan) {
        this.plan = plan;
        this.codeTaken = async () => false;
    }
    member() {
        const record = this.plan.port.myRecord();
        return { nick: record.nick, joinedAt: record.joinedAt, look: record.look };
    }
    async create(match) {
        const assign = this.plan.assign(match);
        const record = this.plan.port.myRecord();
        record.slot = assign[this.plan.myId] === undefined ? 0 : assign[this.plan.myId];
        const code = await this.plan.directory.create(this.plan.myId, record, { assign, matchId: match.matchId }, this.codeTaken);
        return code ? { room: code, host: this.plan.myId } : null;
    }
    async discard(made) {
        await this.plan.backend.database.ref(this.plan.rules.root + "/" + made.room).remove();
    }
    enterRoom(ticket, hosting) {
        return this.plan.port.enterTicketRoom(ticket.room, hosting);
    }
    leaveRoom() {
        this.plan.port.leaveRoomQuietly();
    }
    startMatch() {
        this.plan.port.startMatch();
    }
    showParty() {
        this.plan.port.showParty();
    }
    showStart(message) {
        this.plan.port.showStart(message);
    }
    presentIds() {
        return this.plan.port.presentIds();
    }
    static humanIds(players) {
        return Array.from(players.keys()).filter((id) => !players.get(id).isBot);
    }
}
class RkRandomSetup {
    static create(plan) {
        const hooks = new RkMatchHooks(plan);
        const panel = new MkPartyPanel(plan.screen, plan.mount, plan.options);
        const flow = new MkRandomFlow(plan.backend.database, plan.backend, plan.myId, plan.options, hooks, panel);
        hooks.codeTaken = (code) => flow.codeTaken(code);
        return flow;
    }
}
