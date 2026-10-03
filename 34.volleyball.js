"use strict";
class VbDom {
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
class VbStateCodec {
    static encode(controller) {
        const round2 = (value) => Math.round(value * 100) / 100;
        const round1 = (value) => Math.round(value * 10) / 10;
        return [round2(controller.x), round2(controller.z), round2(controller.yaw), controller.moving ? 1 : 0, round1(controller.ix), round1(controller.iz), round1(controller.aimX), round1(controller.aimZ), controller.jumpStartMs > 0 ? Math.round(controller.jumpStartMs) : 0].join(",");
    }
    static decode(raw) {
        if (typeof raw !== "string")
            return null;
        const parts = raw.split(",").map(Number);
        if (parts.length < 9 || parts.some((part) => isNaN(part)))
            return null;
        return { x: parts[0], z: parts[1], yaw: parts[2], moving: parts[3] === 1, ix: parts[4], iz: parts[5], ax: parts[6], az: parts[7], js: parts[8] };
    }
}
class VbBackend {
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
class VbSeatPlan {
    static humanSeats(players) {
        const seats = [null, null, null, null];
        players.forEach((record, id) => {
            if (!record.isBot && !record.spectator && record.slot >= 0 && record.slot < VbConfig.SEAT_COUNT)
                seats[record.slot] = id;
        });
        return seats;
    }
    static spectators(players) {
        const ids = [];
        players.forEach((record, id) => { if (record.spectator)
            ids.push(id); });
        return ids;
    }
    static freeSeat(players) {
        return VbSeatPlan.humanSeats(players).indexOf(null);
    }
    static swapUpdates(players, first, second) {
        const seats = VbSeatPlan.humanSeats(players);
        const updates = {};
        if (seats[first])
            updates["players/" + seats[first] + "/slot"] = second;
        if (seats[second])
            updates["players/" + seats[second] + "/slot"] = first;
        return updates;
    }
    static matchSeats(match) {
        const seats = [null, null, null, null];
        if (!match || !match.seats)
            return seats;
        for (let slot = 0; slot < VbConfig.SEAT_COUNT; slot++)
            seats[slot] = match.seats["s" + slot] || null;
        return seats;
    }
}
class VbBotLooks {
    static create(team) {
        const look = CharacterLooks.random();
        look.p.top = VbConfig.TEAM_TOP_COLOR_INDEX[team] + 1;
        return look;
    }
}
class VbRoomSession {
    constructor(backend, code, myId, hosting) {
        this.backend = backend;
        this.code = code;
        this.myId = myId;
        this.hosting = hosting;
        this.players = new Map();
        this.hostId = null;
        this.hostLoaded = false;
        this.status = "lobby";
        this.match = null;
        this.ball = null;
        this.rally = null;
        this.end = null;
        this.onChange = () => undefined;
        this.onRemoteState = () => undefined;
        this.onPress = () => undefined;
        this.onPlayerRemoved = () => undefined;
        this.onClosed = () => undefined;
        this.subscriptions = [];
        this.leaving = false;
        this.ref = backend.database.ref(VbConfig.ROOT + "/" + code);
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
    order() {
        return Array.from(this.players.keys()).sort((a, b) => {
            const difference = this.players.get(a).joinedAt - this.players.get(b).joinedAt;
            return difference || (a < b ? -1 : 1);
        });
    }
    connect() {
        this.armDisconnect();
        const playersRef = this.ref.child("players");
        this.subscribe(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
        this.subscribe(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
        this.subscribe(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
        this.watchValue("hostPlayerId", (value) => { this.hostId = value || null; this.hostLoaded = true; this.onChange("host"); });
        this.watchValue("status", (value) => {
            if (value === null) {
                if (!this.leaving)
                    this.onClosed("방이 종료되었어요.");
                return;
            }
            this.status = value;
            this.onChange("status");
        });
        this.watchValue("match", (value) => { this.match = value; this.onChange("match"); });
        this.watchValue("ball", (value) => { this.ball = value; this.onChange("ball"); });
        this.watchValue("rally", (value) => { this.rally = value; this.onChange("rally"); });
        this.watchValue("end", (value) => { this.end = value; this.onChange("end"); });
        const stateRef = this.ref.child("st");
        const onState = (snapshot) => {
            const state = VbStateCodec.decode(snapshot.val());
            if (state && snapshot.key !== this.myId)
                this.onRemoteState(snapshot.key, state);
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
    writeBall(record) {
        this.ref.child("ball").set(record);
    }
    writeRally(record) {
        this.ref.child("rally").set(record);
    }
    leave() {
        this.leaving = true;
        this.unsubscribeAll();
        this.cancelDisconnect();
        if (this.hosting) {
            this.ref.remove().catch(() => undefined);
            return;
        }
        this.removeMine();
    }
    silentClose() {
        this.leaving = true;
        this.unsubscribeAll();
        this.cancelDisconnect();
    }
    removeMineOnUnload() {
        if (this.hosting) {
            try {
                this.ref.remove();
            }
            catch (error) {
                return;
            }
        }
        else {
            this.removeMine();
        }
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
            if (this.hosting)
                this.ref.onDisconnect().cancel();
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
        if (this.hosting)
            this.ref.onDisconnect().remove();
    }
    setPlayer(snapshot) {
        const record = snapshot.val();
        if (!record)
            return;
        record.look = CharacterLooks.clean(record.look);
        this.players.set(snapshot.key, record);
        this.onChange("players");
    }
    removePlayer(snapshot) {
        this.players.delete(snapshot.key);
        if (snapshot.key === this.myId && !this.leaving) {
            this.onClosed("연결이 끊겨 방에서 나왔어요.");
            return;
        }
        this.onPlayerRemoved(snapshot.key);
        this.onChange("players");
    }
}
class VbRoomDirectory {
    constructor(backend) {
        this.backend = backend;
    }
    async create(myId, record) {
        await this.sweep();
        const database = this.backend.database;
        for (let attempt = 0; attempt < 9; attempt++) {
            const code = String(10000 + Math.floor(Math.random() * 90000));
            const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.now(), players: { [myId]: record } };
            const result = await database.ref(VbConfig.ROOT + "/" + code).transaction((current) => (current !== null ? undefined : room));
            if (result.committed)
                return code;
        }
        return null;
    }
    async join(code, myId, record, asSpectator) {
        const room = this.backend.database.ref(VbConfig.ROOT + "/" + code);
        const [playersSnapshot, statusSnapshot] = await Promise.all([room.child("players").once("value"), room.child("status").once("value")]);
        const players = playersSnapshot.val();
        if (!players || !Object.keys(players).some((id) => !players[id].isBot))
            return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
        const map = new Map(Object.keys(players).map((id) => [id, players[id]]));
        const seat = VbSeatPlan.freeSeat(map);
        const lobby = statusSnapshot.val() === "lobby";
        const spectate = asSpectator || !lobby || seat < 0;
        if (spectate) {
            if (VbSeatPlan.spectators(map).length > 0)
                return { ok: false, message: "관전 자리가 이미 찼어요. 다음 판에 들어와 주세요." };
            await room.child("players/" + myId).set(Object.assign({}, record, { slot: VbConfig.SPECTATOR_SLOT, spectator: true }));
            const reason = asSpectator ? "" : lobby ? "선수 자리가 가득 차서 관전으로 들어왔어요." : "경기 중이라 관전으로 들어왔어요.";
            return { ok: true, message: reason };
        }
        await room.child("players/" + myId).set(Object.assign({}, record, { slot: seat, spectator: false }));
        return { ok: true, message: "" };
    }
    async sweep() {
        try {
            const base = this.backend.databaseUrl();
            const response = await fetch(base + "/" + VbConfig.ROOT + ".json?shallow=true");
            const codes = response.ok ? Object.keys((await response.json()) || {}) : [];
            const now = this.backend.now();
            const database = this.backend.database;
            const updates = {};
            await Promise.all(codes.map(async (code) => {
                const room = database.ref(VbConfig.ROOT + "/" + code);
                const [created, players] = await Promise.all([room.child("createdAt").once("value"), room.child("players").once("value")]);
                const age = now - (created.val() || 0);
                const map = players.val() || {};
                const hasHuman = Object.keys(map).some((id) => !map[id].isBot);
                if ((!hasHuman && age > VbRoomDirectory.STALE_EMPTY_MS) || age > VbRoomDirectory.STALE_OLD_MS)
                    updates[code] = null;
            }));
            if (Object.keys(updates).length)
                await database.ref(VbConfig.ROOT).update(updates);
        }
        catch (error) {
            return;
        }
    }
}
VbRoomDirectory.STALE_EMPTY_MS = 60000;
VbRoomDirectory.STALE_OLD_MS = 6 * 3600000;
class VbLabelFactory {
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
class VbCourtTextures {
    constructor(libs) {
        this.libs = libs;
    }
    floor() {
        const width = 1024, height = 1680;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        const pixelsPerMeterX = width / VbCourtView.FLOOR_WIDTH;
        const pixelsPerMeterZ = height / VbCourtView.FLOOR_LENGTH;
        context.fillStyle = "#B9854F";
        context.fillRect(0, 0, width, height);
        const plankHeight = pixelsPerMeterZ * 0.28;
        for (let y = 0, index = 0; y < height; y += plankHeight, index++) {
            context.fillStyle = index % 2 ? "rgba(255,230,190,.08)" : "rgba(60,30,10,.07)";
            context.fillRect(0, y, width, plankHeight);
            context.fillStyle = "rgba(60,32,12,.35)";
            context.fillRect(0, y, width, 2);
        }
        const courtLeft = (VbCourtView.FLOOR_WIDTH / 2 - VbConfig.HALF_W) * pixelsPerMeterX;
        const courtTop = (VbCourtView.FLOOR_LENGTH / 2 - VbConfig.HALF_L) * pixelsPerMeterZ;
        const courtWidth = VbConfig.HALF_W * 2 * pixelsPerMeterX;
        const courtHeight = VbConfig.HALF_L * 2 * pixelsPerMeterZ;
        context.fillStyle = "rgba(48,112,170,.55)";
        context.fillRect(courtLeft, courtTop, courtWidth, courtHeight);
        context.strokeStyle = "#FFFFFF";
        context.lineWidth = 6;
        context.strokeRect(courtLeft, courtTop, courtWidth, courtHeight);
        const centerY = courtTop + courtHeight / 2;
        context.beginPath();
        context.moveTo(courtLeft, centerY);
        context.lineTo(courtLeft + courtWidth, centerY);
        context.stroke();
        context.lineWidth = 3;
        [-3, 3].forEach((offset) => {
            context.beginPath();
            context.moveTo(courtLeft, centerY + offset * pixelsPerMeterZ);
            context.lineTo(courtLeft + courtWidth, centerY + offset * pixelsPerMeterZ);
            context.stroke();
        });
        const texture = new this.libs.THREE.CanvasTexture(canvas);
        texture.colorSpace = this.libs.THREE.SRGBColorSpace;
        return texture;
    }
    net() {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 64;
        const context = canvas.getContext("2d");
        context.strokeStyle = "rgba(255,255,255,.85)";
        context.lineWidth = 2;
        for (let x = 0; x <= 512; x += 16) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, 64);
            context.stroke();
        }
        for (let y = 0; y <= 64; y += 16) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(512, y);
            context.stroke();
        }
        const texture = new this.libs.THREE.CanvasTexture(canvas);
        texture.colorSpace = this.libs.THREE.SRGBColorSpace;
        return texture;
    }
    ball() {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, 256, 128);
        context.fillStyle = "#3E8EF0";
        context.fillRect(0, 26, 256, 22);
        context.fillRect(0, 80, 256, 22);
        context.fillStyle = "#F2C93B";
        context.fillRect(0, 52, 256, 24);
        context.fillStyle = "rgba(0,0,0,.18)";
        for (let x = 0; x < 256; x += 64)
            context.fillRect(x, 0, 3, 128);
        const texture = new this.libs.THREE.CanvasTexture(canvas);
        texture.colorSpace = this.libs.THREE.SRGBColorSpace;
        return texture;
    }
}
class VbCourtView {
    constructor(libs, textures) {
        this.libs = libs;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshLambertMaterial({ color: "#2B2638" }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.03;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(VbCourtView.FLOOR_WIDTH, VbCourtView.FLOOR_LENGTH), new THREE.MeshBasicMaterial({ map: textures.floor() }));
        floor.rotation.x = -Math.PI / 2;
        this.group.add(ground, floor);
        this.buildWalls();
        this.buildNet(textures);
        this.buildRefereeStand();
    }
    async loadDecor() {
        const THREE = this.libs.THREE;
        const loader = new this.libs.GLTFLoader();
        await Promise.all(VbCourtView.DECOR.map((entry) => loader.loadAsync("assets/kaykit/dungeon/" + entry.file + ".gltf").then((gltf) => {
            gltf.scene.traverse((node) => {
                const mesh = node;
                if (!mesh.isMesh || Array.isArray(mesh.material))
                    return;
                const source = mesh.material;
                mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color });
            });
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const size = box.getSize(new THREE.Vector3());
            const scale = entry.height / Math.max(size.y, 0.001);
            gltf.scene.scale.setScalar(scale);
            const holder = new THREE.Group();
            holder.add(gltf.scene);
            gltf.scene.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
            holder.position.set(entry.x, 0, entry.z);
            holder.rotation.y = entry.turn;
            this.group.add(holder);
        }).catch(() => undefined)));
    }
    buildWalls() {
        const THREE = this.libs.THREE;
        const material = new THREE.MeshLambertMaterial({ color: "#5E5870" });
        const addWall = (width, depth, x, z) => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth), material);
            wall.position.set(x, 0.5, z);
            this.group.add(wall);
        };
        const halfWidth = VbCourtView.FLOOR_WIDTH / 2, halfLength = VbCourtView.FLOOR_LENGTH / 2;
        addWall(VbCourtView.FLOOR_WIDTH + 0.8, 0.4, 0, -halfLength - 0.2);
        addWall(VbCourtView.FLOOR_WIDTH + 0.8, 0.4, 0, halfLength + 0.2);
        addWall(0.4, VbCourtView.FLOOR_LENGTH, -halfWidth - 0.2, 0);
        addWall(0.4, VbCourtView.FLOOR_LENGTH, halfWidth + 0.2, 0);
    }
    buildNet(textures) {
        const THREE = this.libs.THREE;
        const poleMaterial = new THREE.MeshLambertMaterial({ color: "#D8D8DE" });
        [-1, 1].forEach((sign) => {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, VbConfig.NET_TOP + 0.35, 10), poleMaterial);
            pole.position.set(sign * (VbConfig.HALF_W + 0.2), (VbConfig.NET_TOP + 0.35) / 2, 0);
            this.group.add(pole);
        });
        const netWidth = VbConfig.HALF_W * 2 + 0.4;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(netWidth, 1), new THREE.MeshBasicMaterial({ map: textures.net(), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
        mesh.position.set(0, VbConfig.NET_TOP - 0.06 - 0.5, 0);
        const band = new THREE.Mesh(new THREE.BoxGeometry(netWidth, 0.12, 0.05), new THREE.MeshLambertMaterial({ color: "#FFFFFF" }));
        band.position.set(0, VbConfig.NET_TOP - 0.06, 0);
        this.group.add(mesh, band);
    }
    buildRefereeStand() {
        const THREE = this.libs.THREE;
        const wood = new THREE.MeshLambertMaterial({ color: "#8A6A44" });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 1.3), wood);
        seat.position.set(-VbConfig.HALF_W - 1.7, 2.3, 0);
        const legGeometry = new THREE.BoxGeometry(0.12, 2.3, 0.12);
        [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].forEach((offset) => {
            const leg = new THREE.Mesh(legGeometry, wood);
            leg.position.set(seat.position.x + offset[0], 1.15, offset[1]);
            this.group.add(leg);
        });
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 1.2), wood);
        back.position.set(seat.position.x - 0.6, 2.75, 0);
        this.group.add(seat, back);
    }
}
VbCourtView.FLOOR_WIDTH = 14;
VbCourtView.FLOOR_LENGTH = 23;
VbCourtView.DECOR = [
    { file: "banner_blue", x: -3.2, z: -11.6, height: 2.6, turn: 0 },
    { file: "banner_green", x: 3.2, z: -11.6, height: 2.6, turn: 0 },
    { file: "banner_blue", x: -3.2, z: 11.6, height: 2.6, turn: Math.PI },
    { file: "banner_green", x: 3.2, z: 11.6, height: 2.6, turn: Math.PI },
    { file: "torch_lit", x: -6.8, z: -6, height: 1.1, turn: 0 },
    { file: "torch_lit", x: 6.8, z: -6, height: 1.1, turn: 0 },
    { file: "torch_lit", x: -6.8, z: 6, height: 1.1, turn: 0 },
    { file: "torch_lit", x: 6.8, z: 6, height: 1.1, turn: 0 }
];
class VbBallView {
    constructor(libs, textures) {
        this.spin = 0;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.sphere = new THREE.Mesh(new THREE.SphereGeometry(VbConfig.BALL_R, 20, 14), new THREE.MeshLambertMaterial({ map: textures.ball() }));
        this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35, depthWrite: false }));
        this.shadow.rotation.x = -Math.PI / 2;
        this.group.add(this.sphere, this.shadow);
    }
    place(x, y, z, speed, deltaSeconds) {
        this.sphere.position.set(x, y, z);
        this.spin += speed * deltaSeconds * 0.9;
        this.sphere.rotation.set(this.spin, 0, this.spin * 0.4);
        const height = Math.max(0, y - VbConfig.BALL_R);
        const scale = 1 / (1 + height * 0.3);
        this.shadow.position.set(x, 0.03, z);
        this.shadow.scale.setScalar(scale);
        this.shadow.material.opacity = 0.38 * scale;
    }
}
class VbMarkerView {
    constructor(libs, parent, crosshair) {
        this.crosshair = crosshair;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.ringMaterial = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.95, depthWrite: false });
        this.fillMaterial = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.28, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.98, 32), this.ringMaterial);
        const fill = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32), this.fillMaterial);
        ring.rotation.x = fill.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        fill.position.y = 0.045;
        this.group.add(ring, fill);
        if (crosshair) {
            [0, Math.PI / 2].forEach((angle) => {
                const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.12), this.ringMaterial);
                bar.rotation.x = -Math.PI / 2;
                bar.rotation.z = angle;
                bar.position.y = 0.055;
                this.group.add(bar);
            });
        }
        this.group.visible = false;
        parent.add(this.group);
    }
    show(x, z, color, scale, opacity) {
        this.group.visible = true;
        this.group.position.set(x, 0, z);
        this.group.scale.set(scale, 1, scale);
        this.ringMaterial.color.set(color);
        this.fillMaterial.color.set(color);
        this.ringMaterial.opacity = opacity;
        this.fillMaterial.opacity = opacity * 0.3;
    }
    hide() {
        this.group.visible = false;
    }
}
class VbPlayerView {
    constructor(libs, factory, assets, labels, parent, slot, record) {
        this.factory = factory;
        this.parent = parent;
        this.slot = slot;
        this.record = record;
        this.shownYaw = 0;
        this.actionUntilMs = 0;
        this.jumpStartMs = -1e9;
        this.jumpHeight = 0;
        const THREE = libs.THREE;
        const color = VbConfig.TEAM_COLORS[VbConfig.teamOfSlot(slot)];
        this.group = new THREE.Group();
        this.model = factory.build(CharacterLooks.clean(record.look));
        this.group.add(this.model);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.74, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        const label = labels.create(record.nick, color);
        label.position.y = 2.75;
        this.group.add(ring, label);
        parent.add(this.group);
        this.animator = new CharacterAnimator(libs, this.model, assets.clips);
        this.animator.play(VbPlayerView.CLIP_IDLE);
        this.shownYaw = VbCourtLayout.facingYaw(VbConfig.teamOfSlot(slot));
    }
    playAction(clip, nowMs, jump) {
        this.animator.play(clip, { once: true });
        this.actionUntilMs = nowMs + 650;
        if (jump) {
            this.jumpStartMs = nowMs;
            this.jumpHeight = VbPlayerView.JUMP_HEIGHT;
        }
    }
    render(x, z, yaw, moving, deltaSeconds, nowMs) {
        this.shownYaw += VbMath.angleDifference(yaw, this.shownYaw) * Math.min(1, deltaSeconds * 14);
        const jumpProgress = (nowMs - this.jumpStartMs) / VbPlayerView.JUMP_MS;
        const lift = jumpProgress >= 0 && jumpProgress <= 1 ? Math.sin(jumpProgress * Math.PI) * this.jumpHeight : 0;
        this.group.position.set(x, lift, z);
        this.group.rotation.y = this.shownYaw;
        if (nowMs >= this.actionUntilMs)
            this.animator.play(moving ? VbPlayerView.CLIP_RUN : VbPlayerView.CLIP_IDLE);
        this.animator.update(deltaSeconds);
    }
    dispose() {
        this.parent.remove(this.group);
        this.factory.disposeModel(this.model);
    }
}
VbPlayerView.CLIP_IDLE = "Idle_A";
VbPlayerView.CLIP_RUN = "Running_A";
VbPlayerView.JUMP_MS = 700;
VbPlayerView.JUMP_HEIGHT = 0.9;
class VbCameraRig {
    constructor(libs) {
        this.focusX = 0;
        this.focusZ = 0;
        this.ready = false;
        this.camera = new libs.THREE.PerspectiveCamera(50, 1, 0.5, 200);
    }
    get perspective() {
        return this.camera;
    }
    resize(aspect) {
        this.camera.aspect = aspect;
        const refereeHalf = Math.atan(Math.tan((VbCameraRig.REFEREE_HALF_FOV * Math.PI) / 180) / aspect);
        this.camera.fov = Math.min(80, Math.max(48, (refereeHalf * 2 * 180) / Math.PI));
        this.camera.updateProjectionMatrix();
    }
    snap() {
        this.ready = false;
    }
    orbit(radius, height, angle) {
        this.camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
        this.camera.lookAt(0, 1.2, 0);
    }
    followPlayer(team, playerX, deltaSeconds) {
        const side = VbConfig.sideOf(team);
        this.smooth(playerX, deltaSeconds);
        this.camera.position.set(this.focusX * 0.4, 10.2, side * 18);
        this.camera.lookAt(this.focusX * 0.2, 0.5, -side * 2);
    }
    watchFromReferee(ballZ, deltaSeconds) {
        this.smooth(ballZ, deltaSeconds);
        this.camera.position.set(11.8, 5.9, this.focusZ * 0.08);
        this.camera.lookAt(0, 1.3, this.focusZ * 0.12);
    }
    smooth(value, deltaSeconds) {
        if (!this.ready) {
            this.focusX = this.focusZ = value;
            this.ready = true;
        }
        const ratio = Math.min(1, deltaSeconds * 4);
        this.focusX += (value - this.focusX) * ratio;
        this.focusZ += (value - this.focusZ) * ratio;
    }
}
VbCameraRig.REFEREE_HALF_FOV = 44;
class VbWorldView {
    constructor(libs, canvas, touchDevice) {
        this.playing = false;
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#1A1626");
        this.scene.add(new THREE.HemisphereLight(0xE6EEFF, 0x504058, 1.35));
        const sun = new THREE.DirectionalLight(0xFFF0D8, 1.3);
        sun.position.set(5, 14, 8);
        this.scene.add(sun);
        this.matchGroup = new THREE.Group();
        this.scene.add(this.matchGroup);
        this.rig = new VbCameraRig(libs);
        this.governor = window.QualityGovernor
            ? window.QualityGovernor({ steps: [() => this.lowerPixelRatio()], storageKey: "volleyball_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
            : null;
        if (this.governor)
            this.governor.restore();
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }
    resize() {
        const width = window.innerWidth, height = window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.rig.resize(width / height);
    }
    render(deltaSeconds) {
        this.renderer.render(this.scene, this.rig.perspective);
        if (this.governor)
            this.governor.update(deltaSeconds);
    }
    lowerPixelRatio() {
        if (this.pixelRatio <= 1)
            return false;
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
        return true;
    }
}
class VolleyballInput {
    constructor(zone, base, knob) {
        this.zone = zone;
        this.base = base;
        this.knob = knob;
        this.onAct = () => undefined;
        this.enabled = true;
        this.held = new Set();
        this.joystickPointer = null;
        this.joystickOriginX = 0;
        this.joystickOriginY = 0;
        this.joystickX = 0;
        this.joystickZ = 0;
        this.bindKeyboard();
        this.bindJoystick();
        this.bindButton("btnAct");
    }
    axis() {
        if (!this.enabled)
            return { x: 0, z: 0 };
        let x = this.joystickX, z = this.joystickZ;
        if (this.held.has("KeyA") || this.held.has("ArrowLeft"))
            x -= 1;
        if (this.held.has("KeyD") || this.held.has("ArrowRight"))
            x += 1;
        if (this.held.has("KeyW") || this.held.has("ArrowUp"))
            z -= 1;
        if (this.held.has("KeyS") || this.held.has("ArrowDown"))
            z += 1;
        const length = Math.hypot(x, z);
        return length > 1 ? { x: x / length, z: z / length } : { x, z };
    }
    releaseAll() {
        this.held.clear();
        this.joystickPointer = null;
        this.joystickX = this.joystickZ = 0;
        this.base.hidden = true;
    }
    bindKeyboard() {
        const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
        window.addEventListener("keydown", (event) => {
            if (event.target.tagName === "INPUT" || !this.enabled)
                return;
            const code = this.codeOf(event);
            if (movementKeys.indexOf(code) >= 0) {
                this.held.add(code);
                event.preventDefault();
            }
            else if (!event.repeat && (code === "Space" || code === "KeyE")) {
                this.onAct();
                event.preventDefault();
            }
        });
        window.addEventListener("keyup", (event) => this.held.delete(this.codeOf(event)));
        window.addEventListener("blur", () => this.held.clear());
    }
    codeOf(event) {
        return event.key.indexOf("Arrow") === 0 ? event.key : event.code;
    }
    bindJoystick() {
        this.zone.addEventListener("pointerdown", (event) => {
            if (this.joystickPointer !== null)
                return;
            this.joystickPointer = event.pointerId;
            this.joystickOriginX = event.clientX;
            this.joystickOriginY = event.clientY;
            this.base.style.left = event.clientX + "px";
            this.base.style.top = event.clientY + "px";
            this.base.hidden = false;
            this.knob.style.transform = "translate(0px,0px)";
            this.zone.setPointerCapture(event.pointerId);
        });
        this.zone.addEventListener("pointermove", (event) => {
            if (event.pointerId !== this.joystickPointer)
                return;
            const deltaX = event.clientX - this.joystickOriginX, deltaY = event.clientY - this.joystickOriginY;
            const length = Math.hypot(deltaX, deltaY) || 1;
            const reach = Math.min(length, VolleyballInput.JOYSTICK_RADIUS);
            this.knob.style.transform = "translate(" + (deltaX / length) * reach + "px," + (deltaY / length) * reach + "px)";
            const strength = Math.min(1, length / VolleyballInput.JOYSTICK_RADIUS);
            if (strength < VolleyballInput.DEAD_ZONE)
                this.joystickX = this.joystickZ = 0;
            else {
                this.joystickX = (deltaX / length) * strength;
                this.joystickZ = (deltaY / length) * strength;
            }
        });
        const end = (event) => {
            if (event.pointerId !== this.joystickPointer)
                return;
            this.joystickPointer = null;
            this.joystickX = this.joystickZ = 0;
            this.base.hidden = true;
        };
        this.zone.addEventListener("pointerup", end);
        this.zone.addEventListener("pointercancel", end);
    }
    bindButton(id) {
        const button = VbDom.byId(id);
        button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            if (this.enabled)
                this.onAct();
        });
    }
}
VolleyballInput.JOYSTICK_RADIUS = 55;
VolleyballInput.DEAD_ZONE = 0.18;
class VbLocalController extends VbPlayerController {
    constructor(slot, input) {
        super(slot);
        this.input = input;
        this.resetAim();
    }
    resetAim() {
        const side = VbConfig.sideOf(this.team);
        this.aimX = 0;
        this.aimZ = -side * 4.5;
    }
    poll(engine, dtSec, nowMs) {
        const axis = this.input.axis();
        const side = VbConfig.sideOf(this.team);
        this.ix = axis.x * side;
        this.iz = axis.z * side;
        if (this.locked) {
            this.aimX = VbMath.clamp(this.aimX + this.ix * VbLocalController.AIM_SPEED * dtSec, -4.2, 4.2);
            this.aimZ = VbMath.clamp(this.aimZ + this.iz * VbLocalController.AIM_SPEED * dtSec, side > 0 ? -8.6 : 0.8, side > 0 ? -0.8 : 8.6);
        }
        this.step(dtSec, nowMs);
    }
}
VbLocalController.AIM_SPEED = 6;
class VbHud {
    constructor() {
        this.teamScore = [VbDom.byId("hudScore0"), VbDom.byId("hudScore1")];
        this.teamBox = [VbDom.byId("hudTeam0"), VbDom.byId("hudTeam1")];
        this.role = VbDom.byId("hudRole");
        this.banner = VbDom.byId("banner");
        this.bannerBox = VbDom.byId("bannerBox");
        this.hint = VbDom.byId("hudHint");
        this.action = VbDom.byId("btnAct");
        this.actionLabel = this.action.querySelector("span");
    }
    update(model) {
        VbDom.setText(this.teamScore[0], String(model.score[0]));
        VbDom.setText(this.teamScore[1], String(model.score[1]));
        this.teamBox.forEach((box, team) => box.classList.toggle("serving", model.serveTeam === team));
        this.teamBox.forEach((box, team) => box.classList.toggle("mine", model.myTeam === team));
        VbDom.show(this.role, model.roleText !== "");
        VbDom.setText(this.role, model.roleText);
        VbDom.show(this.banner, model.banner !== "");
        VbDom.setText(this.bannerBox, model.banner);
        VbDom.show(this.hint, model.hint !== "");
        VbDom.setText(this.hint, model.hint);
        VbDom.show(this.action, model.actionLabel !== "");
        VbDom.setText(this.actionLabel, model.actionLabel);
        this.action.classList.toggle("ready", model.actionReady);
    }
}
class VbHostDirector {
    constructor(engine, onEvents) {
        this.engine = engine;
        this.onEvents = onEvents;
        this.started = false;
        this.lastTickMs = 0;
        this.lastPressSeq = new Map();
    }
    get hasStarted() {
        return this.started;
    }
    begin(nowMs) {
        this.started = true;
        this.lastTickMs = nowMs;
        this.onEvents(this.engine.begin(nowMs));
    }
    tick(dtSec, nowMs) {
        if (!this.started)
            return;
        const elapsed = Math.min(VbHostDirector.MAX_TICK_SEC, Math.max(0, (nowMs - this.lastTickMs) / 1000));
        this.lastTickMs = nowMs;
        this.engine.players.forEach((controller) => controller.poll(this.engine, elapsed, nowMs));
        this.onEvents(this.engine.update(elapsed, nowMs));
    }
    receivePress(controller, id, record) {
        const last = this.lastPressSeq.get(id) || 0;
        if (record.n <= last)
            return;
        this.lastPressSeq.set(id, record.n);
        if (record.j)
            controller.jumpStartMs = record.t;
        else
            controller.registerPress(record.t, record.ax, record.az);
    }
}
VbHostDirector.MAX_TICK_SEC = 0.5;
class VolleyballMatch {
    constructor(services, session) {
        this.services = services;
        this.session = session;
        this.seats = [null, null, null, null];
        this.controllers = [];
        this.local = null;
        this.director = null;
        this.engine = null;
        this.ball = null;
        this.rally = null;
        this.seatsDirty = true;
        this.lastSentMs = 0;
        this.botSent = new Map();
        this.localSent = { text: "", at: 0 };
        this.lastRallyNo = 0;
        this.pressCounter = 0;
        this.ended = false;
        this.totalFlight = 1;
        this.totalFlightSeq = -1;
        const THREE = services.libs.THREE;
        this.group = new THREE.Group();
        services.world.matchGroup.add(this.group);
        this.ballView = new VbBallView(services.libs, services.textures);
        this.group.add(this.ballView.group);
        this.receiveMarker = new VbMarkerView(services.libs, this.group, false);
        this.aimMarker = new VbMarkerView(services.libs, this.group, true);
        const seatIds = VbSeatPlan.matchSeats(session.match);
        this.mySlot = seatIds.indexOf(session.myId);
        if (this.mySlot >= 0)
            this.local = new VbLocalController(this.mySlot, services.input);
        services.world.playing = true;
        services.world.rig.snap();
        services.input.enabled = this.mySlot >= 0;
        this.ball = session.ball;
        this.rally = session.rally;
        this.syncSeats();
        if (session.isHost()) {
            this.engine = new VbRallyEngine(this.controllers, Math.random);
            this.director = new VbHostDirector(this.engine, (events) => this.applyEvents(events));
        }
    }
    applyChange(kind) {
        if (kind === "players" || kind === "match")
            this.seatsDirty = true;
        if (kind === "ball" && !this.isHost())
            this.applyBall(this.session.ball);
        if (kind === "rally" && !this.isHost())
            this.applyRally(this.session.rally);
    }
    receiveRemote(id, state) {
        const seat = this.seats.find((actor) => !!actor && actor.id === id);
        if (seat && seat.controller instanceof VbRemoteController)
            seat.controller.receive(state.x, state.z, state.yaw, state.moving, state.ix, state.iz, state.ax, state.az, state.js);
    }
    receivePress(id, record) {
        if (!this.director)
            return;
        const seat = this.seats.find((actor) => !!actor && actor.id === id);
        if (seat)
            this.director.receivePress(seat.controller, id, record);
    }
    playerRemoved(id) {
        if (!this.isHost())
            return;
        const slot = this.seats.findIndex((actor) => !!actor && actor.id === id);
        if (slot < 0 || !this.session.match)
            return;
        const botId = "bot" + Math.random().toString(36).slice(2, 8);
        const record = { nick: VbConfig.BOT_NAMES[slot], isBot: true, joinedAt: this.services.backend.now(), slot, look: VbBotLooks.create(VbConfig.teamOfSlot(slot)) };
        this.session.ref.update({ ["players/" + botId]: record, ["match/seats/s" + slot]: botId });
    }
    markEnded() {
        this.ended = true;
    }
    dispose() {
        this.services.world.playing = false;
        this.services.input.releaseAll();
        this.seats.forEach((actor) => { if (actor)
            actor.view.dispose(); });
        this.services.world.matchGroup.remove(this.group);
    }
    update(deltaSeconds) {
        const now = this.services.backend.now();
        if (this.seatsDirty)
            this.syncSeats();
        this.tryBeginHost(now);
        this.driveControllers(deltaSeconds, now);
        this.sendStates(now);
        this.renderWorld(deltaSeconds, now);
        this.services.hud.update(this.hudModel(now));
        this.services.world.render(deltaSeconds);
    }
    isHost() {
        return this.session.isHost();
    }
    syncSeats() {
        const seatIds = VbSeatPlan.matchSeats(this.session.match);
        let complete = true;
        for (let slot = 0; slot < VbConfig.SEAT_COUNT; slot++) {
            const id = seatIds[slot];
            const record = id ? this.session.players.get(id) : undefined;
            const current = this.seats[slot];
            if (!id || !record) {
                complete = false;
                continue;
            }
            if (current && current.id === id)
                continue;
            const previous = current ? current.controller : null;
            if (current)
                current.view.dispose();
            const controller = this.makeController(slot, id, record, previous);
            const view = new VbPlayerView(this.services.libs, this.services.factory, this.services.assets, this.services.labels, this.group, slot, record);
            this.seats[slot] = { id, seenJump: 0, controller, view };
            this.controllers[slot] = controller;
        }
        this.seatsDirty = !complete;
    }
    makeController(slot, id, record, previous) {
        let controller;
        if (id === this.session.myId && this.local)
            controller = this.local;
        else if (this.isHost() && record.isBot)
            controller = new VolleyballBot(slot, Math.random);
        else
            controller = new VbRemoteController(slot);
        if (previous) {
            controller.x = previous.x;
            controller.z = previous.z;
            controller.yaw = previous.yaw;
            if (controller instanceof VbRemoteController)
                controller.teleport(previous.x, previous.z);
            controller.locked = previous.locked;
        }
        else if (this.rally) {
            const spot = VbCourtLayout.homeSpot(slot, this.rally.serveTeam, this.rally.server);
            controller.teleport(spot.x, spot.z);
        }
        else {
            const spot = VbCourtLayout.defendSpot(slot);
            controller.teleport(spot.x, spot.z);
        }
        return controller;
    }
    tryBeginHost(now) {
        if (!this.director || this.director.hasStarted || this.seatsDirty)
            return;
        this.director.begin(now);
    }
    driveControllers(deltaSeconds, now) {
        if (this.local)
            this.local.locked = !!this.rally && this.rally.phase === "serve" && this.rally.server === this.mySlot;
        if (this.director && this.director.hasStarted) {
            this.director.tick(deltaSeconds, now);
            return;
        }
        this.controllers.forEach((controller) => controller.poll(null, deltaSeconds, now));
    }
    sendStates(now) {
        if (now - this.lastSentMs < VbConfig.NET_MS)
            return;
        this.lastSentMs = now;
        if (this.local)
            this.sendIfNeeded(this.localSent, VbStateCodec.encode(this.local), now, this.session.myId);
        if (!this.isHost())
            return;
        this.seats.forEach((actor) => {
            if (!actor || !(actor.controller instanceof VolleyballBot))
                return;
            let sent = this.botSent.get(actor.id);
            if (!sent) {
                sent = { text: "", at: 0 };
                this.botSent.set(actor.id, sent);
            }
            this.sendIfNeeded(sent, VbStateCodec.encode(actor.controller), now, actor.id);
        });
    }
    sendIfNeeded(sent, text, now, id) {
        if (text === sent.text && now - sent.at < VolleyballMatch.STATE_KEEPALIVE_MS)
            return;
        sent.text = text;
        sent.at = now;
        this.session.writeState(text, id);
    }
    pressAction() {
        const local = this.local;
        if (!local || this.ended)
            return;
        const now = this.services.backend.now();
        const jump = this.isJumpPress(local, now);
        if (jump) {
            if (local.isJumping(now) || now < local.jumpStartMs + VbConfig.JUMP_MS + 250)
                return;
            local.jumpStartMs = now;
        }
        if (this.isHost()) {
            if (!jump)
                local.registerPress(now, local.aimX, local.aimZ);
            return;
        }
        this.pressCounter++;
        this.session.writePress({ n: this.pressCounter, t: now, ax: local.aimX, az: local.aimZ, j: jump ? 1 : 0 });
    }
    isJumpPress(local, now) {
        const rally = this.rally, ball = this.ball;
        if (!rally || rally.phase !== "play" || !ball)
            return false;
        const onMySide = this.ballPosition(now).z * VbConfig.sideOf(local.team) > 0;
        return !(ball.to === local.team && onMySide);
    }
    applyEvents(events) {
        for (const event of events) {
            if (event.type === "ball") {
                this.session.writeBall(event.ball);
                this.applyBall(event.ball);
            }
            else {
                this.session.writeRally(event.rally);
                this.applyRally(event.rally);
                if (event.rally.phase === "over")
                    this.finishMatch(event.rally);
            }
        }
    }
    finishMatch(rally) {
        this.session.ref.update({ end: { winner: rally.winner, sa: rally.sa, sb: rally.sb, at: this.services.backend.now() }, status: "end" });
    }
    applyBall(record) {
        if (!record)
            return;
        this.ball = record;
        const now = this.services.backend.now();
        const actor = record.by >= 0 && record.by < VbConfig.SEAT_COUNT ? this.seats[record.by] : null;
        const clip = VolleyballMatch.CLIPS[record.kind];
        if (actor && clip && Math.abs(now - record.at) < 1500)
            actor.view.playAction(clip, now, VolleyballMatch.JUMP_KINDS.indexOf(record.kind) >= 0);
    }
    applyRally(record) {
        if (!record)
            return;
        this.rally = record;
        if (record.phase === "serve" && record.n !== this.lastRallyNo) {
            this.lastRallyNo = record.n;
            if (!this.isHost())
                this.seats.forEach((actor) => {
                    if (!actor)
                        return;
                    const spot = VbCourtLayout.homeSpot(actor.controller.slot, record.serveTeam, record.server);
                    actor.controller.teleport(spot.x, spot.z);
                    actor.controller.locked = actor.controller.slot === record.server;
                });
            if (this.local)
                this.local.resetAim();
        }
    }
    ballPosition(now) {
        const ball = this.ball;
        if (!ball)
            return { x: 0, y: VbConfig.SERVE_HAND_Y, z: 0, speed: 0 };
        if (ball.hold)
            return { x: ball.x, y: ball.y, z: ball.z, speed: 0 };
        const seconds = VbMath.clamp((now - ball.at) / 1000, 0, 6);
        const position = VbBallPhysics.positionAt(ball, seconds);
        return { x: position.x, y: Math.max(position.y, VbConfig.BALL_R), z: position.z, speed: Math.hypot(ball.vx, ball.vz) };
    }
    renderWorld(deltaSeconds, now) {
        const ballPosition = this.ballPosition(now);
        this.ballView.place(ballPosition.x, ballPosition.y, ballPosition.z, ballPosition.speed, deltaSeconds);
        this.seats.forEach((actor) => {
            if (!actor)
                return;
            const controller = actor.controller;
            if (controller.jumpStartMs > actor.seenJump) {
                actor.seenJump = controller.jumpStartMs;
                if (now - controller.jumpStartMs < VbConfig.JUMP_MS)
                    actor.view.playAction("Melee_Block", controller.jumpStartMs, true);
            }
            actor.view.render(controller.x, controller.z, controller.yaw, controller.moving, deltaSeconds, now);
        });
        this.updateMarkers(now);
        const rig = this.services.world.rig;
        if (this.local)
            rig.followPlayer(this.local.team, this.local.x, deltaSeconds);
        else
            rig.watchFromReferee(ballPosition.z, deltaSeconds);
    }
    viewerSeesTeam(team) {
        return !this.local || this.local.team === team;
    }
    updateMarkers(now) {
        this.updateReceiveMarker(now);
        this.updateAimMarker();
    }
    updateReceiveMarker(now) {
        const ball = this.ball;
        if (!ball || ball.hold || ball.to < 0 || !this.viewerSeesTeam(ball.to)) {
            this.receiveMarker.hide();
            return;
        }
        const crossing = VbBallPhysics.crossing(ball, ball.ry);
        if (!crossing) {
            this.receiveMarker.hide();
            return;
        }
        if (ball.seq !== this.totalFlightSeq) {
            this.totalFlightSeq = ball.seq;
            this.totalFlight = Math.max(0.3, crossing.t);
        }
        const remaining = ball.at / 1000 + crossing.t - now / 1000;
        if (remaining < -0.25) {
            this.receiveMarker.hide();
            return;
        }
        const own = ball.kind === "dig" || ball.kind === "set";
        const color = own ? VolleyballMatch.TOSS_COLORS[ball.to] : VolleyballMatch.INCOMING_COLOR;
        const progress = VbMath.clamp(remaining / this.totalFlight, 0, 1);
        const blink = remaining < 0.45 ? 0.55 + 0.45 * Math.sin(now / 45) : 1;
        this.receiveMarker.show(crossing.x, crossing.z, color, 0.5 + 0.7 * progress, 0.95 * blink);
    }
    updateAimMarker() {
        const rally = this.rally, ball = this.ball;
        let slot = -1;
        if (rally && rally.phase === "serve" && ball && (ball.kind === "hold" || ball.kind === "toss"))
            slot = rally.server;
        else if (rally && rally.phase === "play" && ball && ball.next >= 0 && ball.n >= 1)
            slot = ball.next;
        const actor = slot >= 0 ? this.seats[slot] : null;
        if (!actor || (this.local && this.local.slot !== slot)) {
            this.aimMarker.hide();
            return;
        }
        const controller = actor.controller;
        const target = rally && rally.phase === "serve" ? { x: controller.aimX, z: controller.aimZ } : this.spikeAimOf(controller);
        this.aimMarker.show(target.x, target.z, VolleyballMatch.AIM_COLOR, 1, 0.9);
    }
    spikeAimOf(controller) {
        const opponents = this.controllers.filter((other) => other.team !== controller.team).map((other) => ({ x: other.x, z: other.z }));
        const depths = this.ball && this.ball.n >= 2 ? ShotAimer.SPIKE_DEPTHS : ShotAimer.LOB_DEPTHS;
        return ShotAimer.emptySpot(controller.team, opponents, depths);
    }
    hudModel(now) {
        const rally = this.rally, ball = this.ball;
        const score = rally ? [rally.sa, rally.sb] : [0, 0];
        const model = {
            score, serveTeam: rally ? rally.serveTeam : -1, myTeam: this.local ? this.local.team : -1,
            roleText: this.local ? "" : "관전 중", banner: "", hint: "", actionLabel: this.local ? "치기" : "", actionReady: false
        };
        if (!rally) {
            model.banner = "경기를 준비하고 있어요…";
            return model;
        }
        model.banner = this.bannerText(rally, now);
        if (this.local && ball)
            this.fillActionHint(model, rally, ball);
        return model;
    }
    bannerText(rally, now) {
        if (rally.phase === "point") {
            const teamName = VbConfig.TEAM_NAMES[rally.winner];
            return teamName + " 득점!  (" + rally.why + ")  " + rally.sa + " : " + rally.sb;
        }
        if (rally.phase === "serve" && now < rally.at) {
            const seconds = Math.ceil((rally.at - now) / 1000);
            return (rally.n === 1 ? "경기 시작! " : "서브 준비 ") + seconds;
        }
        return "";
    }
    fillActionHint(model, rally, ball) {
        const local = this.local;
        if (rally.phase === "serve") {
            if (rally.server === local.slot) {
                model.actionLabel = ball.kind === "toss" ? "서브!" : "공 띄우기";
                model.actionReady = true;
                model.hint = ball.kind === "toss" ? "공이 가장 높이 떴을 때 한 번 더 눌러 서브!" : "스틱으로 목표 지점을 정하고 버튼으로 공을 띄워요";
            }
            else {
                model.hint = rally.server >= 0 && VbConfig.teamOfSlot(rally.server) === local.team ? "동료가 서브해요" : "상대가 서브해요 · 주황 표식으로 달려가요";
            }
            return;
        }
        if (rally.phase !== "play")
            return;
        if (ball.to >= 0 && ball.to !== local.team && ball.kind === "set" && ball.n === 2) {
            model.actionLabel = "블로킹";
            model.actionReady = true;
            model.hint = "상대가 공격해요 · 네트 앞에서 스파이크 방향을 읽고 제자리 점프(버튼)로 블로킹!";
            return;
        }
        if (ball.to !== local.team)
            return;
        if (ball.kind !== "dig" && ball.kind !== "set") {
            model.hint = "표식 위로 달려가면 자동으로 받아요";
            return;
        }
        const mine = ball.next === local.slot;
        if (!mine) {
            model.hint = "동료가 공을 받아요";
            return;
        }
        model.actionReady = true;
        if (ball.n === 1) {
            model.actionLabel = "넘기기";
            model.hint = "누르지 않으면 동료에게 토스 · 누르면 상대 코트로 높게 넘겨요";
        }
        else {
            model.actionLabel = "스파이크";
            model.hint = "공이 닿기 직전에 누르면 점프 스파이크(빈 곳으로 자동) · 안 누르면 낮고 빠르게 넘겨요";
        }
    }
}
VolleyballMatch.STATE_KEEPALIVE_MS = 1000;
VolleyballMatch.CLIPS = {
    toss: "Throw", serve: "Melee_1H_Attack_Chop", dig: "Melee_Block", set: "Ranged_Magic_Raise",
    over: "Throw", spike: "Melee_1H_Attack_Jump_Chop", quick: "Melee_1H_Attack_Chop", block: "Melee_Block"
};
VolleyballMatch.JUMP_KINDS = ["serve", "spike"];
VolleyballMatch.TOSS_COLORS = ["#5DBB63", "#4C8DFF"];
VolleyballMatch.INCOMING_COLOR = "#D97B4F";
VolleyballMatch.AIM_COLOR = "#FFD23F";
class VbScreens {
    constructor(touchDevice) {
        this.touchDevice = touchDevice;
        this.start = VbDom.byId("startScreen");
        this.lobby = VbDom.byId("lobbyScreen");
        this.end = VbDom.byId("endScreen");
        this.gameUi = VbDom.byId("gameUi");
        this.joystickZone = VbDom.byId("joyZone");
        this.current = "start";
    }
    show(name, canControl = true) {
        this.current = name;
        VbDom.show(this.start, name === "start");
        VbDom.show(this.lobby, name === "lobby");
        VbDom.show(this.end, name === "end");
        VbDom.show(this.gameUi, name === "game");
        VbDom.show(this.joystickZone, name === "game" && this.touchDevice && canControl);
        document.body.classList.toggle("in-game", name === "game");
    }
}
class VbLobbyView {
    constructor() {
        this.code = VbDom.byId("lobbyCode");
        this.seatBoard = VbDom.byId("seatBoard");
        this.spectatorLine = VbDom.byId("spectatorLine");
        this.startButton = VbDom.byId("btnStart");
        this.modeButton = VbDom.byId("btnSeatMode");
        this.hint = VbDom.byId("lobbyHint");
        this.onSeatClick = () => undefined;
        this.selectedSlot = -1;
        this.seatBoard.addEventListener("click", (event) => {
            const seat = event.target.closest("[data-slot]");
            if (seat)
                this.onSeatClick(Number(seat.dataset.slot));
        });
    }
    render(session) {
        const isHost = session.isHost();
        const seats = VbSeatPlan.humanSeats(session.players);
        VbDom.setText(this.code, session.code);
        const teamHtml = [0, 1].map((team) => {
            const rows = [team * 2, team * 2 + 1].map((slot) => this.seatHtml(session, seats[slot], slot)).join("");
            return "<div class='vbTeam' style='--team:" + VbConfig.TEAM_COLORS[team] + "'><h3>" + VbConfig.TEAM_NAMES[team] + "</h3>" + rows + "</div>";
        }).join("");
        this.seatBoard.innerHTML = teamHtml;
        const spectatorNames = VbSeatPlan.spectators(session.players).map((id) => session.players.get(id).nick + (id === session.myId ? " (나)" : ""));
        VbDom.setText(this.spectatorLine, "관전: " + (spectatorNames.length ? spectatorNames.join(", ") : "없음"));
        const humans = seats.filter((id) => !!id).length;
        VbDom.show(this.startButton, isHost);
        const spectating = session.isSpectator();
        this.modeButton.textContent = spectating ? "선수로 참가하기" : "관전자로 바꾸기";
        this.modeButton.disabled = spectating ? VbSeatPlan.freeSeat(session.players) < 0 : VbSeatPlan.spectators(session.players).length > 0;
        VbDom.setText(this.hint, isHost
            ? "사람 " + humans + "명 · 빈 자리 " + (VbConfig.SEAT_COUNT - humans) + "곳은 AI가 채워요. 자리를 눌러 두 칸을 바꿀 수 있어요."
            : "방장이 시작하길 기다리는 중이에요… 빈 자리를 누르면 옮길 수 있어요.");
    }
    seatHtml(session, id, slot) {
        const selected = this.selectedSlot === slot ? " selected" : "";
        if (!id)
            return "<button type='button' class='vbSeat empty" + selected + "' data-slot='" + slot + "'><b>AI</b><small>빈 자리</small></button>";
        const record = session.players.get(id);
        const tag = id === session.hostId ? "방장" : "";
        const mine = id === session.myId ? " me" : "";
        return "<button type='button' class='vbSeat" + mine + selected + "' data-slot='" + slot + "'><b>" + VbDom.escape(record.nick) + "</b><small>" + tag + (id === session.myId ? " 나" : "") + "</small></button>";
    }
}
class VbEndView {
    constructor() {
        this.title = VbDom.byId("endTitle");
        this.reason = VbDom.byId("endReason");
        this.rows = VbDom.byId("endRows");
    }
    render(session, end) {
        const seats = VbSeatPlan.matchSeats(session.match);
        const myTeam = seats.indexOf(session.myId) >= 0 ? VbConfig.teamOfSlot(seats.indexOf(session.myId)) : -1;
        VbDom.setText(this.title, VbConfig.TEAM_NAMES[end.winner] + " 승리!" + (myTeam >= 0 ? (myTeam === end.winner ? "  (우리가 이겼어요)" : "  (아쉬워요)") : ""));
        VbDom.setText(this.reason, VbConfig.TEAM_NAMES[0] + " " + end.sa + " : " + end.sb + " " + VbConfig.TEAM_NAMES[1]);
        this.rows.innerHTML = [0, 1, 2, 3].map((slot) => {
            const id = seats[slot];
            const record = id ? session.players.get(id) : undefined;
            const team = VbConfig.teamOfSlot(slot);
            const name = record ? record.nick + (record.isBot ? " (AI)" : "") : "(나감)";
            const result = team === end.winner ? "승리" : "패배";
            return "<tr" + (id === session.myId ? " class='meRow'" : "") + "><td><span class='rankDot' style='background:" + VbConfig.TEAM_COLORS[team] + "'></span>" + VbDom.escape(name) + "</td><td>" + VbConfig.TEAM_NAMES[team] + "</td><td>" + result + "</td></tr>";
        }).join("");
    }
}
class VbMenuBackdrop {
    constructor(world, libs, textures) {
        this.world = world;
        this.libs = libs;
        this.views = [];
        this.seconds = 0;
        this.hopIndex = -1;
        this.ballView = new VbBallView(libs, textures);
        world.scene.add(this.ballView.group);
    }
    prepare(factory, assets, labels) {
        if (this.views.length)
            return;
        for (let slot = 0; slot < VbConfig.SEAT_COUNT; slot++) {
            const record = { nick: VbConfig.BOT_NAMES[slot], isBot: true, joinedAt: 0, slot, look: VbBotLooks.create(VbConfig.teamOfSlot(slot)) };
            const view = new VbPlayerView(this.libs, factory, assets, labels, this.world.scene, slot, record);
            this.views.push(view);
        }
    }
    render(deltaSeconds) {
        this.seconds += deltaSeconds;
        const nowMs = this.seconds * 1000;
        this.ballView.group.visible = true;
        const hops = this.seconds / VbMenuBackdrop.HOP_SECONDS;
        const hop = Math.floor(hops);
        const progress = hops - hop;
        const fromTeam = hop % 2;
        const direction = VbConfig.sideOf(fromTeam);
        const ballZ = direction * (5.2 - 10.4 * progress);
        const ballX = Math.sin(hops * 1.3) * 2;
        const height = VbConfig.BALL_R + 4 * progress * (1 - progress) * VbMenuBackdrop.PEAK + 0.8 * (1 - progress);
        this.ballView.place(ballX, height, ballZ, 4, deltaSeconds);
        if (hop !== this.hopIndex) {
            this.hopIndex = hop;
            const sender = this.views[fromTeam * 2 + (Math.floor(hop / 2) % 2)];
            if (sender)
                sender.playAction("Melee_1H_Attack_Jump_Chop", nowMs, true);
        }
        this.views.forEach((view, slot) => {
            const spot = VbCourtLayout.defendSpot(slot);
            const team = VbConfig.teamOfSlot(slot);
            const approach = VbConfig.sideOf(team) * direction > 0 ? 0 : 1;
            const x = spot.x + Math.sin(this.seconds * 0.8 + slot) * 0.7 + (slot % 2 === 0 ? -1 : 1) * 0.3 * approach;
            view.render(x, spot.z, VbCourtLayout.facingYaw(team), false, deltaSeconds, nowMs);
        });
        this.world.rig.orbit(VbMenuBackdrop.RADIUS, VbMenuBackdrop.HEIGHT, (this.seconds / VbMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2);
        this.world.render(deltaSeconds);
    }
    hide() {
        this.ballView.group.visible = false;
        this.views.forEach((view) => { view.group.visible = false; });
    }
    show() {
        this.views.forEach((view) => { view.group.visible = true; });
    }
}
VbMenuBackdrop.ORBIT_SECONDS = 70;
VbMenuBackdrop.RADIUS = 17;
VbMenuBackdrop.HEIGHT = 7.5;
VbMenuBackdrop.HOP_SECONDS = 1.8;
VbMenuBackdrop.PEAK = 3.4;
class VolleyballGame {
    constructor(libs) {
        this.libs = libs;
        this.touchDevice = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
        this.profile = new PlayerProfile();
        this.backend = new VbBackend();
        this.directory = new VbRoomDirectory(this.backend);
        this.screens = new VbScreens(this.touchDevice);
        this.lobbyView = new VbLobbyView();
        this.endView = new VbEndView();
        this.myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        this.session = null;
        this.match = null;
        this.assetsReady = false;
        this.lastFrameMs = 0;
        this.loop = (timeMs) => {
            this.step(timeMs);
            requestAnimationFrame(this.loop);
        };
        this.assets = new CharacterAssets(libs);
        this.factory = new CharacterModelFactory(libs, this.assets);
        this.textures = new VbCourtTextures(libs);
        this.court = new VbCourtView(libs, this.textures);
        this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
        FoldCard.bindAll(document);
        const input = new VolleyballInput(VbDom.byId("joyZone"), VbDom.byId("joyBase"), VbDom.byId("joyKnob"));
        input.onAct = () => { if (this.match)
            this.match.pressAction(); };
        this.services = {
            libs, assets: this.assets, factory: this.factory, labels: new VbLabelFactory(libs),
            world: new VbWorldView(libs, VbDom.byId("view"), this.touchDevice),
            hud: new VbHud(), input, backend: this.backend, court: this.court, textures: this.textures
        };
        this.services.world.scene.add(this.court.group);
        this.backdrop = new VbMenuBackdrop(this.services.world, libs, this.textures);
        this.bindMenus();
        this.screens.show("start");
        this.updateStartButtons();
        this.loadAssets();
        requestAnimationFrame(this.loop);
        window.setInterval(() => { if (document.hidden)
            this.step(performance.now()); }, 250);
        window.addEventListener("pagehide", () => { if (this.session)
            this.session.removeMineOnUnload(); });
    }
    async loadAssets() {
        try {
            await Promise.all([this.assets.load(), this.court.loadDecor()]);
            this.assetsReady = true;
            this.backdrop.prepare(this.factory, this.assets, this.services.labels);
            VbDom.setText(VbDom.byId("loadNote"), "");
            this.editor.mount(VbDom.byId("profileHost"));
            this.editor.setActive(true);
            this.editor.onChange(() => this.pushProfile());
            this.updateStartButtons();
        }
        catch (error) {
            VbDom.setText(VbDom.byId("loadNote"), "캐릭터를 불러오지 못했어요. 새로고침해 주세요.");
        }
    }
    bindMenus() {
        VbDom.byId("btnCreate").addEventListener("click", () => this.createRoom());
        VbDom.byId("btnJoin").addEventListener("click", () => this.joinRoom(false));
        VbDom.byId("btnWatch").addEventListener("click", () => this.joinRoom(true));
        VbDom.byId("joinCode").addEventListener("keydown", (event) => { if (event.key === "Enter")
            this.joinRoom(false); });
        VbDom.byId("btnStart").addEventListener("click", () => this.startMatch());
        VbDom.byId("btnLeave").addEventListener("click", () => this.leaveRoom());
        VbDom.byId("btnEndLeave").addEventListener("click", () => this.leaveRoom());
        VbDom.byId("btnGameLeave").addEventListener("click", () => this.leaveRoom());
        VbDom.byId("btnToLobby").addEventListener("click", () => this.returnToLobby());
        VbDom.byId("btnSeatMode").addEventListener("click", () => this.toggleSeatMode());
        this.lobbyView.onSeatClick = (slot) => this.clickSeat(slot);
    }
    updateStartButtons() {
        const ok = !!this.backend.database && this.assetsReady;
        ["btnCreate", "btnJoin", "btnWatch"].forEach((id) => { VbDom.byId(id).disabled = !ok; });
        if (!this.backend.database)
            this.showStartMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
    }
    showStartMessage(text) {
        VbDom.setText(VbDom.byId("startMsg"), text);
    }
    myRecord() {
        return { nick: this.profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: this.profile.look, spectator: false };
    }
    pushProfile() {
        if (this.session)
            this.session.pushProfile({ nick: this.profile.nickOrDefault(), look: this.profile.look });
    }
    async createRoom() {
        if (!this.backend.database)
            return;
        this.showStartMessage("");
        const button = VbDom.byId("btnCreate");
        button.disabled = true;
        try {
            const code = await this.directory.create(this.myId, this.myRecord());
            if (code)
                this.enterRoom(code, true, "");
            else
                this.showStartMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
        }
        catch (error) {
            this.showStartMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
        }
        button.disabled = false;
    }
    async joinRoom(asSpectator) {
        if (!this.backend.database)
            return;
        const code = VbDom.byId("joinCode").value.replace(/\D/g, "");
        if (code.length !== 5) {
            this.showStartMessage("방 코드 5자리를 입력해 주세요.");
            return;
        }
        this.showStartMessage("");
        try {
            const outcome = await this.directory.join(code, this.myId, this.myRecord(), asSpectator);
            if (outcome.ok)
                this.enterRoom(code, false, outcome.message);
            else
                this.showStartMessage(outcome.message);
        }
        catch (error) {
            this.showStartMessage("방을 불러오지 못했어요.");
        }
    }
    enterRoom(code, hosting, notice) {
        const session = new VbRoomSession(this.backend, code, this.myId, hosting);
        this.session = session;
        session.onChange = (kind) => this.onSessionChange(kind);
        session.onRemoteState = (id, state) => { if (this.match)
            this.match.receiveRemote(id, state); };
        session.onPress = (id, record) => { if (this.match)
            this.match.receivePress(id, record); };
        session.onPlayerRemoved = (id) => { if (this.match)
            this.match.playerRemoved(id); };
        session.onClosed = (message) => this.exitToStart(message);
        session.connect();
        this.lobbyView.selectedSlot = -1;
        this.showLobby();
        VbDom.setText(VbDom.byId("lobbyNotice"), notice);
    }
    showLobby() {
        this.screens.show("lobby");
        this.editor.mount(VbDom.byId("lobbyProfileHost"));
        this.editor.setActive(true);
        if (this.session)
            this.lobbyView.render(this.session);
    }
    showStart(message) {
        this.screens.show("start");
        this.editor.mount(VbDom.byId("profileHost"));
        this.editor.setActive(true);
        this.showStartMessage(message);
    }
    onSessionChange(kind) {
        const session = this.session;
        if (!session)
            return;
        if (this.screens.current === "lobby" && (kind === "players" || kind === "host" || kind === "status"))
            this.lobbyView.render(session);
        if (kind === "status" || kind === "match" || kind === "end" || (kind === "players" && session.status === "play" && !this.match))
            this.syncPhase();
        if (this.match)
            this.match.applyChange(kind);
    }
    syncPhase() {
        const session = this.session;
        if (!session)
            return;
        if (session.status === "lobby") {
            if (this.match)
                this.disposeMatch();
            if (this.screens.current !== "lobby")
                this.showLobby();
            this.lobbyView.render(session);
        }
        else if (session.status === "play" && session.match && !this.match && session.me()) {
            this.editor.setActive(false);
            this.match = new VolleyballMatch(this.services, session);
            this.screens.show("game", !session.isSpectator());
        }
        else if (session.status === "end" && session.end && this.screens.current !== "end") {
            if (this.match)
                this.match.markEnded();
            this.endView.render(session, session.end);
            this.screens.show("end");
            VbDom.show(VbDom.byId("btnToLobby"), session.isHost());
            VbDom.setText(VbDom.byId("endHint"), session.isHost() ? "" : "방장이 대기실로 돌아가길 기다려요…");
        }
    }
    disposeMatch() {
        if (this.match)
            this.match.dispose();
        this.match = null;
    }
    clickSeat(slot) {
        const session = this.session;
        if (!session || session.status !== "lobby")
            return;
        const seats = VbSeatPlan.humanSeats(session.players);
        if (session.isHost()) {
            const picked = this.lobbyView.selectedSlot;
            if (picked < 0)
                this.lobbyView.selectedSlot = slot;
            else if (picked === slot)
                this.lobbyView.selectedSlot = -1;
            else {
                const updates = VbSeatPlan.swapUpdates(session.players, picked, slot);
                if (Object.keys(updates).length)
                    session.ref.update(updates);
                this.lobbyView.selectedSlot = -1;
            }
            this.lobbyView.render(session);
            return;
        }
        const me = session.me();
        if (me && !seats[slot])
            session.ref.child("players/" + session.myId).update({ slot, spectator: false });
    }
    toggleSeatMode() {
        const session = this.session;
        if (!session || session.status !== "lobby")
            return;
        if (session.isSpectator()) {
            const seat = VbSeatPlan.freeSeat(session.players);
            if (seat >= 0)
                session.ref.child("players/" + session.myId).update({ slot: seat, spectator: false });
        }
        else if (VbSeatPlan.spectators(session.players).length === 0) {
            session.ref.child("players/" + session.myId).update({ slot: VbConfig.SPECTATOR_SLOT, spectator: true });
        }
    }
    startMatch() {
        const session = this.session;
        if (!session || !session.isHost() || session.status !== "lobby")
            return;
        const humans = VbSeatPlan.humanSeats(session.players);
        const seats = {};
        const updates = {};
        for (let slot = 0; slot < VbConfig.SEAT_COUNT; slot++) {
            const human = humans[slot];
            if (human) {
                seats["s" + slot] = human;
                continue;
            }
            const botId = "bot" + Math.random().toString(36).slice(2, 8);
            seats["s" + slot] = botId;
            const record = { nick: VbConfig.BOT_NAMES[slot], isBot: true, joinedAt: this.backend.now() + 1 + slot, slot, look: VbBotLooks.create(VbConfig.teamOfSlot(slot)) };
            updates["players/" + botId] = record;
        }
        const match = { id: 1 + Math.floor(Math.random() * 1000000000), startAt: this.backend.now(), seats };
        Object.assign(updates, { match, status: "play", st: null, in: null, ball: null, rally: null, end: null });
        session.ref.update(updates);
    }
    returnToLobby() {
        const session = this.session;
        if (!session || !session.isHost())
            return;
        const updates = { status: "lobby", match: null, ball: null, rally: null, end: null, st: null, in: null };
        session.players.forEach((record, id) => { if (record.isBot)
            updates["players/" + id] = null; });
        session.ref.update(updates);
    }
    leaveRoom() {
        if (this.session)
            this.session.leave();
        this.session = null;
        this.disposeMatch();
        this.showStart("");
    }
    exitToStart(message) {
        if (this.session)
            this.session.silentClose();
        this.session = null;
        this.disposeMatch();
        this.showStart(message);
    }
    step(timeMs) {
        const deltaSeconds = Math.min(0.1, Math.max(0, (timeMs - this.lastFrameMs) / 1000));
        this.lastFrameMs = timeMs;
        if (this.match) {
            this.backdrop.hide();
            this.match.update(deltaSeconds);
        }
        else {
            this.backdrop.show();
            this.backdrop.render(deltaSeconds);
        }
    }
}
