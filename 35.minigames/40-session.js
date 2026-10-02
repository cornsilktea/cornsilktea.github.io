"use strict";
class SubscriptionSet {
    constructor() {
        this.entries = [];
    }
    add(ref, event, listener) {
        ref.on(event, listener);
        this.entries.push({ ref, event, listener });
    }
    closeAll() {
        this.entries.forEach((entry) => {
            try {
                entry.ref.off(entry.event, entry.listener);
            }
            catch (error) {
                return;
            }
        });
        this.entries = [];
    }
}
class SessionWire {
    constructor(base) {
        this.base = base;
    }
    writeMany(stream, values) {
        this.base.child(stream).update(values);
    }
    push(stream, value) {
        this.base.child(stream).push(value);
    }
    set(stream, key, value) {
        this.base.child(stream + "/" + key).set(value);
    }
    claimEarliest(stream, key, value) {
        this.base.child(stream + "/" + key).transaction((current) => (current !== null && current <= value ? undefined : value));
    }
}
class CollectionSession {
    constructor(backend, env, code, myId, listener) {
        this.backend = backend;
        this.env = env;
        this.code = code;
        this.myId = myId;
        this.listener = listener;
        this.hostPlayerId = null;
        this.roomStatus = "lobby";
        this.roomPlan = [];
        this.currentRound = null;
        this.resultDeadline = 0;
        this.players = new Map();
        this.results = null;
        this.wins = {};
        this.hostLoaded = false;
        this.leaving = false;
        this.roomSubscriptions = new SubscriptionSet();
        this.gameSubscriptions = new SubscriptionSet();
        this.ref = backend.ref(CollectionRules.ROOM_ROOT + "/" + code);
    }
    get hostId() { return this.hostPlayerId; }
    get status() { return this.roomStatus; }
    get plan() { return this.roomPlan; }
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
        this.roomSubscriptions.add(this.backend.ref(".info/connected"), "value", (snapshot) => {
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
        this.watchValue("plan", (value) => { this.roomPlan = value || []; });
        this.watchValue("round", (value) => { this.currentRound = value; this.listener.roundChanged(); });
        this.watchValue("nextAt", (value) => { this.resultDeadline = value || 0; });
        this.watchValue("results", (value) => { this.results = value; this.listener.resultsChanged(); });
        this.watchValue("wins", (value) => { this.wins = value || {}; this.listener.winsChanged(); });
    }
    wireFor(kind) {
        return new SessionWire(this.ref.child("games/" + kind));
    }
    listenGame(kind, streams, handler) {
        this.gameSubscriptions.closeAll();
        const base = this.ref.child("games/" + kind);
        streams.forEach((stream) => {
            stream.events.forEach((event) => {
                this.gameSubscriptions.add(base.child(stream.name), event, (snapshot) => handler(stream.name, snapshot.key, snapshot.val()));
            });
        });
    }
    closeGame() {
        this.gameSubscriptions.closeAll();
    }
    updateRoom(values) {
        return this.ref.update(values);
    }
    pushProfile(nick, look) {
        if (this.players.has(this.myId))
            this.ref.child("players/" + this.myId).update({ nick, look });
    }
    leave() {
        this.shutDown();
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
        this.shutDown();
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
    shutDown() {
        this.leaving = true;
        this.roomSubscriptions.closeAll();
        this.gameSubscriptions.closeAll();
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
        this.roomSubscriptions.add(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
        this.roomSubscriptions.add(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
        this.roomSubscriptions.add(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
    }
    watchValue(path, apply) {
        this.roomSubscriptions.add(this.ref.child(path), "value", (snapshot) => apply(snapshot.val()));
    }
    armDisconnect() {
        this.ref.child("players/" + this.myId).onDisconnect().remove();
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
        if (!last || tries >= CollectionSession.REJOIN_TRIES) {
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
                this.env.afterMs(CollectionSession.REJOIN_DELAY_MS, () => this.rejoinAfterDrop(last, tries + 1));
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
CollectionSession.REJOIN_TRIES = 3;
CollectionSession.REJOIN_DELAY_MS = 1000;
class CollectionDirectory {
    constructor(backend, env, tokens) {
        this.backend = backend;
        this.env = env;
        this.tokens = tokens;
    }
    async create(myId, record) {
        await this.sweep();
        for (let attempt = 0; attempt < CollectionDirectory.CREATE_ATTEMPTS; attempt++) {
            const code = this.tokens.digits(CollectionRules.ROOM_CODE_LENGTH);
            const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.clock.now(), players: { [myId]: record } };
            const result = await this.backend.ref(CollectionRules.ROOM_ROOT + "/" + code).transaction((current) => (current !== null ? undefined : room));
            if (result.committed)
                return code;
        }
        return null;
    }
    async join(code, myId, makeRecord) {
        const room = this.backend.ref(CollectionRules.ROOM_ROOT + "/" + code);
        const playersSnapshot = await room.child("players").once("value");
        const players = playersSnapshot.val();
        if (!players || !Object.keys(players).some((id) => !players[id].isAI))
            return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
        if (Object.keys(players).length >= CollectionRules.MAX_PLAYERS)
            return { ok: false, message: "방이 가득 찼어요. (최대 " + CollectionRules.MAX_PLAYERS + "명)" };
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
            const listing = await this.env.readJson(base + "/" + CollectionRules.ROOM_ROOT + ".json?shallow=true");
            const codes = Object.keys(listing || {});
            const now = this.backend.clock.now();
            const verdicts = await Promise.all(codes.map((code) => this.isStale(code, now)));
            const updates = {};
            codes.forEach((code, index) => { if (verdicts[index])
                updates[code] = null; });
            if (Object.keys(updates).length)
                await this.backend.ref(CollectionRules.ROOM_ROOT).update(updates);
        }
        catch (error) {
            return;
        }
    }
    async isStale(code, now) {
        const room = this.backend.ref(CollectionRules.ROOM_ROOT + "/" + code);
        const [created, players] = await Promise.all(["createdAt", "players"].map((key) => room.child(key).once("value")));
        const age = now - (created.val() || 0);
        const records = players.val() || {};
        const hasHuman = Object.keys(records).some((id) => records[id] && !records[id].isAI);
        return (!hasHuman && age > CollectionRules.STALE_EMPTY_ROOM_MS) || age > CollectionRules.STALE_OLD_ROOM_MS;
    }
}
CollectionDirectory.CREATE_ATTEMPTS = 9;
class CollectionDirector {
    constructor(session, catalog, random) {
        this.session = session;
        this.catalog = catalog;
        this.random = random;
        this.roundEnding = false;
        this.advancing = false;
        this.closing = false;
        this.tokens = new TokenSource(random);
    }
    startCollection() {
        if (!this.session.isHost() || this.session.status !== "lobby")
            return;
        const players = this.session.playerRecords();
        const updates = {};
        const humanCount = Array.from(players.values()).filter((record) => !record.isAI).length;
        if (humanCount === 1)
            this.ensureOneAi(players, updates);
        else
            this.removeAllAi(players, updates);
        updates.results = null;
        updates.plan = PlanBuilder.build(this.catalog.ids(), CollectionRules.ROUNDS_PER_GAME);
        this.session.updateRoom(updates).then(() => this.startRound(1, players));
    }
    backToLobby() {
        if (!this.session.isHost())
            return;
        const updates = { status: "lobby", results: null, round: null, plan: null, games: null, nextAt: 0 };
        this.session.playerRecords().forEach((record, id) => { if (record.isAI)
            updates["players/" + id] = null; });
        this.roundEnding = false;
        this.advancing = false;
        this.closing = false;
        this.session.updateRoom(updates);
    }
    tick(game) {
        if (!this.session.isHost())
            return;
        const now = this.session.now();
        if (this.session.status === "play") {
            if (game && game.isOver())
                this.finishRound(game);
        }
        else if (this.session.status === "roundEnd" && this.session.nextAt && now >= this.session.nextAt && this.session.round) {
            this.advanceAfterResult(this.session.round.n);
        }
    }
    startRound(roundNumber, known) {
        const source = known || this.session.playerRecords();
        const ids = Array.from(source.keys()).sort((a, b) => (source.get(a).slot || 0) - (source.get(b).slot || 0));
        this.roundEnding = false;
        this.advancing = false;
        const plan = this.session.plan.length ? this.session.plan : PlanBuilder.build(this.catalog.ids(), CollectionRules.ROUNDS_PER_GAME);
        if (ids.length < CollectionRules.MIN_PLAYERS || !plan[roundNumber - 1]) {
            this.session.updateRoom({ status: "lobby" });
            return;
        }
        const startAt = this.session.now() + CollectionRules.COUNTDOWN_MS + CollectionRules.COUNTDOWN_LEAD_MS;
        this.session.updateRoom({
            status: "play", games: null, nextAt: 0,
            round: { n: roundNumber, kind: plan[roundNumber - 1], seed: Math.floor(this.random.next() * 1e9), startAt, roster: ids }
        });
    }
    advanceAfterResult(finishedRound) {
        if (finishedRound >= this.session.plan.length) {
            this.finishCollection();
            return;
        }
        if (this.advancing)
            return;
        this.advancing = true;
        this.startRound(finishedRound + 1);
    }
    finishRound(game) {
        const round = this.session.round;
        if (this.roundEnding || !round)
            return;
        this.roundEnding = true;
        const ranks = {};
        game.ranking().forEach((entry) => { ranks[entry.id] = entry.rank; });
        const names = {};
        const known = new Map();
        game.participants().forEach((participant) => known.set(participant.id, participant.nick));
        round.roster.forEach((id) => {
            names[id] = (this.session.hasPlayer(id) && this.session.player(id).nick) || known.get(id) || "?";
        });
        const updates = { status: "roundEnd", nextAt: this.session.now() + CollectionRules.RESULT_MS };
        updates["results/" + round.n] = { kind: round.kind, ranks, names };
        this.session.updateRoom(updates);
    }
    finishCollection() {
        if (this.closing)
            return;
        this.closing = true;
        const scores = new TournamentScores(this.session.resultsRecord());
        const updates = { status: "final" };
        scores.winnerIds().forEach((id) => {
            if (this.session.hasPlayer(id))
                updates["wins/" + id] = this.session.winsOf(id) + 1;
        });
        this.session.updateRoom(updates);
    }
    ensureOneAi(players, updates) {
        if (Array.from(players.values()).some((record) => record.isAI))
            return;
        const used = new Set();
        players.forEach((record) => used.add(record.nick));
        const nick = CollectionRules.AI_NAMES.filter((name) => !used.has(name))[0] || CollectionRules.AI_FALLBACK_NAME;
        const id = "ai_" + this.tokens.token(6);
        const record = { nick, isAI: true, ai: true, joinedAt: this.session.now() + 1, slot: SlotAllocator.freeSlot(players.values()), look: CharacterLooks.random() };
        updates["players/" + id] = record;
        players.set(id, record);
    }
    removeAllAi(players, updates) {
        Array.from(players.keys()).forEach((id) => {
            if (!players.get(id).isAI)
                return;
            updates["players/" + id] = null;
            players.delete(id);
        });
    }
}
