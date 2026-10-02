"use strict";
class RoomBackend {
    constructor(env) {
        this.env = env;
        this.database = null;
        this.clock = new OffsetClock();
        const config = env.portalConfig();
        const api = env.firebaseApi();
        try {
            if (api && config && config.isReady()) {
                api.initializeApp({ apiKey: config.API_KEY, authDomain: config.AUTH_DOMAIN, databaseURL: config.DB_URL.replace(/\/+$/, "") });
                this.database = api.database();
            }
        }
        catch (error) {
            this.database = null;
        }
        if (this.database) {
            this.database.ref(".info/serverTimeOffset").on("value", (snapshot) => {
                this.clock.setOffset(snapshot.val() || 0);
            });
        }
    }
    isOnline() {
        return this.database !== null;
    }
    ref(path) {
        return this.database.ref(path);
    }
    databaseUrl() {
        const config = this.env.portalConfig();
        return config ? config.DB_URL.replace(/\/+$/, "") : "";
    }
}
class SlotAllocator {
    static freeSlot(records) {
        const used = new Set();
        for (const record of records)
            used.add(record.slot);
        for (let slot = 0; slot < LastTileRules.MAX_PLAYERS; slot++)
            if (!used.has(slot))
                return slot;
        return 0;
    }
}
class LastTileRoomSession {
    constructor(backend, env, code, myId, listener) {
        this.backend = backend;
        this.env = env;
        this.code = code;
        this.myId = myId;
        this.listener = listener;
        this.hostPlayerId = null;
        this.roomStatus = "lobby";
        this.currentRound = null;
        this.resultDeadline = 0;
        this.players = new Map();
        this.results = null;
        this.wins = {};
        this.hostLoaded = false;
        this.leaving = false;
        this.subscriptions = [];
        this.ref = backend.ref(LastTileRules.ROOM_ROOT + "/" + code);
    }
    get hostId() { return this.hostPlayerId; }
    get status() { return this.roomStatus; }
    get round() { return this.currentRound; }
    get nextAt() { return this.resultDeadline; }
    isHost() {
        return this.hostPlayerId === this.myId;
    }
    now() {
        return this.backend.clock.now();
    }
    player(id) {
        return this.players.get(id);
    }
    hasPlayer(id) {
        return this.players.has(id);
    }
    playerCount() {
        return this.players.size;
    }
    playerRecords() {
        return new Map(this.players);
    }
    playerIds() {
        return Array.from(this.players.keys()).sort((a, b) => (this.player(a).joinedAt || 0) - (this.player(b).joinedAt || 0));
    }
    humanIds() {
        return this.playerIds().filter((id) => !this.player(id).isAI);
    }
    winsOf(id) {
        return this.wins[id] || 0;
    }
    resultsRecord() {
        return this.results;
    }
    connect() {
        this.armDisconnect();
        this.watchPlayers();
        this.subscribe(this.backend.ref(".info/connected"), "value", (snapshot) => {
            if (snapshot.val() === true && !this.leaving)
                this.armDisconnect();
        });
        this.watchValue("hostPlayerId", (value) => {
            this.hostPlayerId = value || null;
            this.hostLoaded = true;
            this.electHost();
            this.listener.hostChanged();
        });
        this.watchValue("status", (value) => {
            if (value === null) {
                if (!this.leaving)
                    this.listener.closed("방이 종료되었어요.");
                return;
            }
            this.roomStatus = value;
            this.listener.statusChanged();
        });
        this.watchValue("round", (value) => { this.currentRound = value; this.listener.roundChanged(); });
        this.watchValue("nextAt", (value) => { this.resultDeadline = value || 0; });
        this.watchValue("results", (value) => { this.results = value; this.listener.resultsChanged(); });
        this.watchValue("wins", (value) => { this.wins = value || {}; this.listener.winsChanged(); });
        this.watchStates();
        this.subscribe(this.ref.child("ev"), "child_added", (snapshot) => this.listener.pushEvent(snapshot.val()));
        this.watchTiles();
        this.subscribe(this.ref.child("out"), "child_added", (snapshot) => this.listener.outRecorded(snapshot.key, snapshot.val() || { t: this.now() }));
    }
    updateRoom(values) {
        return this.ref.update(values);
    }
    writeStates(states) {
        this.ref.child("st").update(states);
    }
    writePush(event) {
        this.ref.child("ev").push(event);
    }
    reportTileStep(floor, index, t) {
        const key = floor + "_" + index;
        if (this.isHost())
            this.ref.child("tiles/" + key).set(t);
        else
            this.ref.child("tileReq/" + key).transaction((current) => (current !== null && current <= t ? undefined : t));
    }
    writeAcceptedTile(floor, index, t) {
        this.ref.child("tiles/" + floor + "_" + index).set(t);
    }
    writeOut(id, record) {
        this.ref.child("out/" + id).set(record);
    }
    pushProfile(nick, look) {
        if (this.players.has(this.myId))
            this.ref.child("players/" + this.myId).update({ nick, look });
    }
    leave() {
        this.leaving = true;
        this.unsubscribeAll();
        const mine = this.ref.child("players/" + this.myId);
        try {
            mine.onDisconnect().cancel();
        }
        catch (error) {
            return;
        }
        mine.remove()
            .then(() => this.ref.child("players").once("value"))
            .then((snapshot) => this.handOverHostOrClose(snapshot.val() || {}))
            .catch(() => undefined);
    }
    silentClose() {
        this.leaving = true;
        this.unsubscribeAll();
        try {
            this.ref.child("players/" + this.myId).onDisconnect().cancel();
        }
        catch (error) {
            return;
        }
    }
    removeMineOnUnload() {
        try {
            this.ref.child("players/" + this.myId).remove();
        }
        catch (error) {
            return;
        }
    }
    handOverHostOrClose(players) {
        const humans = Object.keys(players).filter((id) => !players[id].isAI).sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0));
        if (!humans.length)
            return this.ref.remove();
        return this.ref.child("hostPlayerId").once("value").then((host) => {
            const hostId = host.val();
            if (!hostId || !players[hostId] || players[hostId].isAI)
                return this.ref.update({ hostPlayerId: humans[0] });
        });
    }
    watchPlayers() {
        const playersRef = this.ref.child("players");
        this.subscribe(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
        this.subscribe(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
        this.subscribe(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
    }
    watchStates() {
        const stateRef = this.ref.child("st");
        const onState = (snapshot) => {
            const decoded = FighterStateCodec.decode(snapshot.val());
            if (decoded)
                this.listener.remoteState(snapshot.key, decoded);
        };
        this.subscribe(stateRef, "child_added", onState);
        this.subscribe(stateRef, "child_changed", onState);
    }
    watchTiles() {
        const parse = (snapshot) => {
            const parts = snapshot.key.split("_");
            return { floor: +parts[0], index: +parts[1], t: +snapshot.val() };
        };
        const onTile = (snapshot) => {
            const tile = parse(snapshot);
            if (!isNaN(tile.index) && isFinite(tile.t))
                this.listener.tileReported(tile.floor, tile.index, tile.t);
        };
        const tilesRef = this.ref.child("tiles");
        this.subscribe(tilesRef, "child_added", onTile);
        this.subscribe(tilesRef, "child_changed", onTile);
        const onRequest = (snapshot) => {
            if (!this.isHost())
                return;
            const tile = parse(snapshot);
            this.listener.tileRequested(tile.floor, tile.index, tile.t);
        };
        const requestRef = this.ref.child("tileReq");
        this.subscribe(requestRef, "child_added", onRequest);
        this.subscribe(requestRef, "child_changed", onRequest);
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
    }
    setPlayer(snapshot) {
        const record = snapshot.val();
        if (!record)
            return;
        record.look = CharacterLooks.clean(record.look);
        this.players.set(snapshot.key, record);
        this.listener.playersChanged();
    }
    removePlayer(snapshot) {
        if (snapshot.key === this.myId && !this.leaving) {
            this.rejoinAfterDrop(snapshot.val() || this.players.get(this.myId) || null, 0);
            return;
        }
        this.players.delete(snapshot.key);
        this.listener.playerLeft(snapshot.key);
        this.electHost();
        this.listener.playersChanged();
    }
    rejoinAfterDrop(last, tries) {
        if (!last || tries >= LastTileRoomSession.REJOIN_TRIES) {
            if (!this.leaving)
                this.listener.closed("연결이 끊겨 방에서 나왔어요.");
            return;
        }
        this.ref.child("status").once("value").then((snapshot) => {
            if (this.leaving)
                return;
            if (snapshot.val() === null) {
                this.listener.closed("방이 종료되었어요.");
                return;
            }
            return this.ref.child("players/" + this.myId).set(last).then(() => this.armDisconnect());
        }).catch(() => {
            if (!this.leaving)
                this.env.afterMs(LastTileRoomSession.REJOIN_DELAY_MS, () => this.rejoinAfterDrop(last, tries + 1));
        });
    }
    electHost() {
        if (!this.hostLoaded || !this.players.has(this.myId))
            return;
        const current = this.hostPlayerId ? this.players.get(this.hostPlayerId) : null;
        if (current && !current.isAI)
            return;
        if (this.humanIds()[0] === this.myId) {
            this.hostPlayerId = this.myId;
            this.ref.update({ hostPlayerId: this.myId });
        }
    }
}
LastTileRoomSession.REJOIN_TRIES = 3;
LastTileRoomSession.REJOIN_DELAY_MS = 1000;
class LastTileRoomDirectory {
    constructor(backend, env, tokens) {
        this.backend = backend;
        this.env = env;
        this.tokens = tokens;
    }
    async create(myId, record) {
        await this.sweep();
        for (let attempt = 0; attempt < LastTileRoomDirectory.CREATE_ATTEMPTS; attempt++) {
            const code = this.tokens.digits(LastTileRules.ROOM_CODE_LENGTH);
            const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.clock.now(), players: { [myId]: record } };
            const result = await this.backend.ref(LastTileRules.ROOM_ROOT + "/" + code).transaction((current) => (current !== null ? undefined : room));
            if (result.committed)
                return code;
        }
        return null;
    }
    async join(code, myId, makeRecord) {
        const room = this.backend.ref(LastTileRules.ROOM_ROOT + "/" + code);
        const [playersSnapshot, statusSnapshot] = await Promise.all([room.child("players").once("value"), room.child("status").once("value")]);
        const players = playersSnapshot.val();
        if (!players || !Object.keys(players).some((id) => !players[id].isAI))
            return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
        if (statusSnapshot.val() !== "lobby")
            return { ok: false, message: "이미 게임이 진행 중이에요. 끝난 뒤 다시 들어와 주세요." };
        if (Object.keys(players).length >= LastTileRules.MAX_PLAYERS)
            return { ok: false, message: "방이 가득 찼어요. (최대 " + LastTileRules.MAX_PLAYERS + "명)" };
        try {
            await room.child("players/" + myId).set(makeRecord(new Map(Object.keys(players).map((id) => [id, players[id]]))));
        }
        catch (error) {
            return { ok: false, message: "입장하지 못했어요." };
        }
        return { ok: true, message: "" };
    }
    async sweep() {
        try {
            const base = this.backend.databaseUrl();
            if (!base)
                return;
            const listing = await this.env.readJson(base + "/" + LastTileRules.ROOM_ROOT + ".json?shallow=true");
            const codes = Object.keys(listing || {});
            const now = this.backend.clock.now();
            const verdicts = await Promise.all(codes.map((code) => this.isStale(code, now)));
            const updates = {};
            codes.forEach((code, index) => { if (verdicts[index])
                updates[code] = null; });
            if (Object.keys(updates).length)
                await this.backend.ref(LastTileRules.ROOM_ROOT).update(updates);
        }
        catch (error) {
            return;
        }
    }
    async isStale(code, now) {
        const room = this.backend.ref(LastTileRules.ROOM_ROOT + "/" + code);
        const [created, , players] = await Promise.all(["createdAt", "status", "players"].map((key) => room.child(key).once("value")));
        const age = now - (created.val() || 0);
        const records = players.val() || {};
        const hasHuman = Object.keys(records).some((id) => records[id] && !records[id].isAI);
        return (!hasHuman && age > LastTileRules.STALE_EMPTY_ROOM_MS) || age > LastTileRules.STALE_OLD_ROOM_MS;
    }
}
LastTileRoomDirectory.CREATE_ATTEMPTS = 9;
class RoomMatchChannel {
    constructor(session) {
        this.session = session;
    }
    publishStates(states) {
        this.session.writeStates(states);
    }
    publishPush(event) {
        this.session.writePush(event);
    }
    publishTileStep(floor, index, t) {
        this.session.reportTileStep(floor, index, t);
    }
    publishOut(fighterId, t) {
        this.session.writeOut(fighterId, { t });
    }
}
