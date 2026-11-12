"use strict";
class BbLabAddress {
    static read() {
        const query = new URLSearchParams(location.search), view = query.get("cam"), freeze = query.get("freeze");
        return {
            scene: BbCurve.clamp(Number(query.get("scene") || 1), 1, 3) - 1,
            view: view && BbLabAddress.VIEWS.some(([name]) => name === view) ? view : "auto",
            batsLeft: query.get("bat") === "L", throwsLeft: query.get("arm") === "L",
            speed: Number(query.get("speed") || 1) || 1,
            freezeAt: freeze === null ? null : Number(freeze),
            plain: query.has("plain")
        };
    }
    static go(options, change) {
        const next = { ...options, ...change }, query = new URLSearchParams();
        query.set("scene", String(next.scene + 1));
        if (next.view !== "auto")
            query.set("cam", next.view);
        if (next.batsLeft)
            query.set("bat", "L");
        if (next.throwsLeft)
            query.set("arm", "L");
        location.search = query.toString();
    }
}
BbLabAddress.VIEWS = [["auto", "자동 연출"], ["pitcher", "투수 시점"], ["batter", "타자 시점"], ["swing", "스윙 확대"], ["mound", "투구 확대"], ["wide", "내야 전체"], ["outfield", "외야 와이드"], ["relay", "중계 와이드"], ["homerun", "홈런 장면"]];
class BbLabDirector {
    constructor(script, sceneIndex, batsLeft, throwsLeft) {
        this.script = script;
        this.sceneIndex = sceneIndex;
        this.batsLeft = batsLeft;
        this.throwsLeft = throwsLeft;
    }
    shot(view, seconds, ball) {
        const side = this.batsLeft ? -1 : 1;
        if (view === "pitcher")
            return { position: BbFieldSpace.toWorld(this.throwsLeft ? -1.5 : 1.5, BbFieldGeometry.RUBBER_DISTANCE + 4.2, 3.1), look: BbFieldSpace.toWorld(0, 0, 0.5), fieldOfView: 26 };
        if (view === "batter")
            return { position: BbFieldSpace.toWorld(0, -4.6, 2.45), look: BbFieldSpace.toWorld(0, 14, 0.9), fieldOfView: 40 };
        if (view === "swing")
            return { position: BbFieldSpace.toWorld(side * 2.9, 2.3, 1.0), look: BbFieldSpace.toWorld(-side * 0.7, 0.2, 0.62), fieldOfView: 34 };
        if (view === "mound")
            return { position: BbFieldSpace.toWorld(-3.4, BbFieldGeometry.RUBBER_DISTANCE - 2.6, 1.3), look: BbFieldSpace.toWorld(0, BbFieldGeometry.RUBBER_DISTANCE - 0.3, 0.95), fieldOfView: 34 };
        if (view === "wide")
            return { position: BbFieldSpace.toWorld(0, -30, 26), look: BbFieldSpace.toWorld(0, 30, 0), fieldOfView: 46 };
        if (view === "outfield")
            return { position: BbFieldSpace.toWorld(-30, 150, 34), look: BbFieldSpace.toWorld(0, 30, 0), fieldOfView: 44 };
        if (view === "homerun")
            return { position: BbFieldSpace.toWorld(18, 70, 9), look: BbFieldSpace.toWorld(-12, 122, 9), fieldOfView: 50 };
        if (view === "relay")
            return this.relayShot();
        return this.autoShot(seconds, ball);
    }
    relayShot() {
        return { position: BbFieldSpace.toWorld(-58, 36, 34), look: BbFieldSpace.toWorld(4, 37, 0), fieldOfView: 55 };
    }
    contactAt() {
        const contact = this.script.checkpoints.find((check) => check.kind === "contact");
        return contact ? contact.at : 2.5;
    }
    autoShot(seconds, ball) {
        const contactAt = this.contactAt(), side = this.batsLeft ? -1 : 1;
        if (seconds < contactAt + 0.12 || !ball)
            return { position: BbFieldSpace.toWorld(side * 2.7, -3.9, 1.55), look: BbFieldSpace.toWorld(-side * 0.35, 6, 0.8), fieldOfView: 40 };
        if (this.sceneIndex === 1) {
            if (seconds < contactAt + 1.3)
                return { position: BbFieldSpace.toWorld(4, -9, 5.5), look: ball.lerp(BbFieldSpace.toWorld(-7, 27, 0.6), 0.5), fieldOfView: 40 };
            if (seconds < contactAt + 2.05)
                return { position: BbFieldSpace.toWorld(-11.5, 23.5, 1.5), look: BbFieldSpace.toWorld(-7.3, 28.3, 0.55), fieldOfView: 36 };
            return { position: BbFieldSpace.toWorld(24, 2, 5), look: ball.lerp(BbFieldGeometry.FIRST.withY(0.8), 0.6), fieldOfView: 34 };
        }
        if (this.sceneIndex === 2) {
            const caught = this.script.checkpoints.find((check) => check.label === "중견수 플라이 포구"), catchAt = caught ? caught.at : contactAt + 4.6;
            if (seconds < catchAt - 1.1)
                return { position: BbFieldSpace.toWorld(-16, 22, 9), look: ball.lerp(BbFieldSpace.toWorld(7, 73, 1), 0.35), fieldOfView: 46 };
            if (seconds < catchAt + 0.45)
                return { position: BbFieldSpace.toWorld(3.5, 67.5, 1.9), look: BbFieldSpace.toWorld(7.1, 73.8, 1.0), fieldOfView: 36 };
            if (seconds < catchAt + 2.0)
                return this.relayShot();
            return { position: BbFieldSpace.toWorld(5.5, -5.5, 2.4), look: BbFieldSpace.toWorld(-1.6, 3, 0.5), fieldOfView: 42 };
        }
        const flat = ball.flat(), away = flat.length() > 1 ? flat.unit() : new BbVec(0, 0, -1);
        const landed = seconds > contactAt + 3.4;
        if (landed)
            return { position: BbFieldSpace.toWorld(-2, 46, 13), look: ball.lerp(BbFieldGeometry.SECOND, 0.5), fieldOfView: 46 };
        return { position: flat.minus(away.times(24)).withY(8 + ball.y * 0.4), look: ball.lerp(BbLabDirector.HOME_LOOK, 0.12), fieldOfView: 46 };
    }
}
BbLabDirector.HOME_LOOK = BbFieldSpace.toWorld(0, 30, 1);
class BbSyncBoard {
    constructor(box, script) {
        this.box = box;
        this.rows = new Map();
        this.worstGrip = 0;
        box.textContent = "";
        const title = document.createElement("div");
        title.className = "lab-sync-title";
        title.textContent = "동작 동기 (사건 시각 대비)";
        box.appendChild(title);
        script.checkpoints.forEach((check) => {
            const row = document.createElement("div");
            row.className = "lab-sync-row";
            row.textContent = check.label + " · " + check.at.toFixed(2) + "초 · 대기";
            box.appendChild(row);
            this.rows.set(check, row);
        });
        this.gripCell = document.createElement("div");
        this.gripCell.className = "lab-sync-row";
        box.appendChild(this.gripCell);
    }
    reset() {
        this.worstGrip = 0;
        this.rows.forEach((row, check) => { row.textContent = check.label + " · " + check.at.toFixed(2) + "초 · 대기"; row.classList.remove("ok", "bad"); });
        this.gripCell.textContent = "";
    }
    record(check, delaySeconds, gapMeters, limitMeters) {
        const row = this.rows.get(check);
        if (!row)
            return;
        const delay = delaySeconds * 1000, good = delay <= 17 && gapMeters <= limitMeters;
        row.textContent = check.label + " · 화면 지연 " + delay.toFixed(1) + "ms · 위치 오차 " + (gapMeters * 100).toFixed(1) + "cm";
        row.classList.toggle("ok", good);
        row.classList.toggle("bad", !good);
    }
    grip(gapMeters, seconds) {
        if (gapMeters <= this.worstGrip)
            return;
        this.worstGrip = gapMeters;
        this.gripCell.textContent = "두 손–배트 최대 간격 " + (gapMeters * 100).toFixed(1) + "cm (" + seconds.toFixed(2) + "초)";
        this.gripCell.classList.toggle("ok", gapMeters <= 0.03);
        this.gripCell.classList.toggle("bad", gapMeters > 0.03);
    }
}
class BbMotionLab {
    constructor(libs) {
        this.libs = libs;
        this.options = BbLabAddress.read();
        this.canvas = document.getElementById("labView");
        this.bar = document.getElementById("labBar");
        this.status = document.getElementById("labStatus");
        this.actors = new Map();
        this.seconds = 0;
        this.paused = false;
        this.lastView = null;
        const THREE = libs.THREE;
        this.speed = this.options.speed;
        this.view = this.options.view;
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog("#cfe4f4", 260, 1000);
        this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 2400);
        this.cameraLook = new THREE.Vector3();
        this.goalPosition = new THREE.Vector3();
        this.goalLook = new THREE.Vector3();
        this.probe = new THREE.Vector3();
        this.probeOther = new THREE.Vector3();
        this.clock = new THREE.Clock();
        window.addEventListener("resize", () => this.resize());
        this.resize();
        this.start().catch((error) => { this.status.textContent = "불러오지 못했어요: " + error.message; });
    }
    resize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }
    async start() {
        const assets = new CharacterAssets(this.libs, BbMotionLab.ASSET_DIRECTORY);
        await assets.load();
        const factory = new CharacterModelFactory(this.libs, assets), gear = new BbGearFactory(this.libs);
        this.scene.add(new BbBallparkBuilder(this.libs, BbBallparkRegistry.MAIN).build());
        new BbParkLighting(this.libs).addTo(this.scene);
        this.createActors(factory, assets, gear);
        this.ball = new BbBallActor(this.libs);
        this.scene.add(this.ball.mesh, this.ball.shadow);
        const metrics = this.actors.get("batter").poser.metrics;
        this.script = BbDrillCatalog.all()[this.options.scene].build({ metrics, batsLeft: this.options.batsLeft, throwsLeft: this.options.throwsLeft });
        this.director = new BbLabDirector(this.script, this.options.scene, this.options.batsLeft, this.options.throwsLeft);
        this.board = new BbSyncBoard(document.getElementById("labSync"), this.script);
        this.buildBar();
        if (this.options.plain)
            document.body.classList.add("plain");
        this.status.textContent = this.script.title + " · 팔 길이 " + metrics.armReach.toFixed(2) + "m · 어깨 높이 " + BbBodyDefaults.standingShoulderHeight(metrics).toFixed(2) + "m";
        this.restart();
        if (this.options.freezeAt !== null)
            this.freeze(this.options.freezeAt);
        this.renderer.setAnimationLoop(() => this.tick());
    }
    createActors(factory, assets, gear) {
        const mine = new PlayerProfile().look, batterFlapOnLeft = !this.options.batsLeft;
        const make = (role, outfit) => {
            const actor = new BbPlayerActor(this.libs, factory, assets, gear, outfit);
            this.scene.add(actor.root);
            this.actors.set(role, actor);
        };
        BbMotionLab.FIELDERS.forEach((role, index) => {
            const look = role === "pitcher" ? mine : CharacterLooks.clean({ c: index % 6, p: { skin: index % 5, hair: (index * 3) % 8 } });
            const gloveSide = role === "pitcher" && this.options.throwsLeft ? "right" : "left";
            make(role, { look, kit: BbTeamKits.HOME, headGear: role === "catcher" ? "mask" : "cap", gloveSide, chestProtector: role === "catcher", carriesBat: false, flapOnLeft: false });
        });
        make("umpire", { look: CharacterLooks.clean({ c: 3, p: { skin: 2, hair: 0 } }), kit: BbTeamKits.UMPIRE, headGear: "mask", gloveSide: null, chestProtector: true, carriesBat: false, flapOnLeft: false });
        make("batter", { look: mine, kit: BbTeamKits.AWAY, headGear: "helmet", gloveSide: null, chestProtector: false, carriesBat: true, flapOnLeft: batterFlapOnLeft });
        make("runner", { look: mine, kit: BbTeamKits.AWAY, headGear: "helmet", gloveSide: null, chestProtector: false, carriesBat: false, flapOnLeft: batterFlapOnLeft });
    }
    button(label, active, onPress) {
        const button = document.createElement("button");
        button.textContent = label;
        button.classList.toggle("on", active);
        button.addEventListener("click", onPress);
        this.bar.appendChild(button);
        return button;
    }
    gap() {
        const spacer = document.createElement("span");
        spacer.className = "lab-gap";
        this.bar.appendChild(spacer);
    }
    buildBar() {
        this.bar.textContent = "";
        BbDrillCatalog.all().forEach((drill, index) => this.button(drill.title, index === this.options.scene, () => BbLabAddress.go(this.options, { scene: index, view: this.view })));
        this.gap();
        const viewButtons = BbLabAddress.VIEWS.map(([name, label]) => this.button(label, name === this.view, () => {
            this.view = name;
            viewButtons.forEach((button, index) => button.classList.toggle("on", BbLabAddress.VIEWS[index][0] === name));
        }));
        this.gap();
        this.button(this.options.batsLeft ? "좌타" : "우타", this.options.batsLeft, () => BbLabAddress.go(this.options, { batsLeft: !this.options.batsLeft, view: this.view }));
        this.button(this.options.throwsLeft ? "좌투" : "우투", this.options.throwsLeft, () => BbLabAddress.go(this.options, { throwsLeft: !this.options.throwsLeft, view: this.view }));
        this.gap();
        const speeds = [[1, "×1"], [0.5, "×0.5"], [0.2, "×0.2"]];
        const speedButtons = speeds.map(([value, label]) => this.button(label, value === this.speed, () => {
            this.speed = value;
            speedButtons.forEach((button, index) => button.classList.toggle("on", speeds[index][0] === value));
        }));
        const pause = this.button("일시정지", false, () => { this.paused = !this.paused; pause.classList.toggle("on", this.paused); });
        this.button("한 프레임 ▶", false, () => { this.paused = true; pause.classList.add("on"); this.advance(BbActionSync.FRAME_SECONDS); });
        this.button("↻ 다시", false, () => this.restart());
    }
    restart() {
        this.seconds = 0;
        this.board.reset();
        this.ball.forgetHolder();
        this.actors.forEach((actor, role) => actor.snapTo(this.script.starts.has(role) ? this.script.frameOf(role, 0) : null));
        this.advance(0);
    }
    freeze(seconds) {
        this.paused = true;
        for (let time = 0; time < seconds - 1e-9; time += BbActionSync.FRAME_SECONDS)
            this.advance(Math.min(BbActionSync.FRAME_SECONDS, seconds - time));
        this.advance(0);
    }
    advance(deltaSeconds) {
        const before = this.seconds;
        this.seconds += deltaSeconds;
        this.measure(before, this.seconds);
        this.actors.forEach((actor, role) => {
            actor.root.visible = this.script.starts.has(role);
            if (!actor.root.visible)
                return;
            actor.update(deltaSeconds, this.script.placementOf(role, this.seconds), this.script.frameOf(role, this.seconds), this.script.gaitOf(role, this.seconds), this.script.speedOf(role, this.seconds));
        });
        const state = this.script.ballAt(this.seconds), holder = state && state.holder ? this.actors.get(state.holder) : null;
        this.ball.update(state, holder, state && state.holder ? this.script.sideOf(state.holder, state.hand) : "right", deltaSeconds);
        this.watchGrip();
    }
    measure(before, now) {
        this.script.checkpoints.forEach((check) => {
            if (!(before < check.at && check.at <= now))
                return;
            const actor = this.actors.get(check.role), placement = this.script.placementOf(check.role, check.at), frame = this.script.frameOf(check.role, check.at);
            actor.snapTo(frame);
            actor.update(0, placement, frame, null, 0);
            let gap = 0, limit = 0.02;
            if (check.kind === "contact") {
                const sweet = actor.batPointWorld(BbBatShape.SWEET_SPOT_AT, this.probe);
                gap = sweet ? sweet.distanceTo(this.probeOther.set(check.point.x, check.point.y, check.point.z)) : 9;
                limit = 0.05;
            }
            else if (check.kind === "touch") {
                gap = actor.root.position.distanceTo(this.probeOther.set(check.point.x, check.point.y, check.point.z));
            }
            else {
                actor.slotWorld(this.script.sideOf(check.role, check.kind === "catch" ? "glove" : "throw"), this.probe);
                gap = this.probe.distanceTo(this.probeOther.set(check.point.x, check.point.y, check.point.z));
            }
            this.board.record(check, (now - check.at) / Math.max(this.speed, 0.01), gap, limit);
        });
    }
    watchGrip() {
        const batter = this.actors.get("batter"), frame = this.script.frameOf("batter", this.seconds);
        if (!frame || !frame.bat)
            return;
        const bottom = this.script.sideOf("batter", "glove"), top = this.script.sideOf("batter", "throw");
        const bottomGrip = batter.batPointWorld(BbBatShape.BOTTOM_HAND_AT, this.probe);
        if (!bottomGrip)
            return;
        const bottomGap = bottomGrip.distanceTo(batter.slotWorld(bottom, this.probeOther));
        const topGrip = batter.batPointWorld(BbBatShape.TOP_HAND_AT, this.probe);
        this.board.grip(Math.max(bottomGap, topGrip.distanceTo(batter.slotWorld(top, this.probeOther))), this.seconds);
    }
    tick() {
        const frameSeconds = Math.min(0.05, this.clock.getDelta());
        if (!this.paused) {
            this.advance(frameSeconds * this.speed);
            if (this.seconds > this.script.duration)
                this.restart();
        }
        this.aimCamera(frameSeconds);
        this.renderer.render(this.scene, this.camera);
    }
    aimCamera(frameSeconds) {
        const state = this.script.ballAt(this.seconds), shot = this.director.shot(this.view, this.seconds, state ? state.point : null);
        this.goalPosition.set(shot.position.x, shot.position.y, shot.position.z);
        this.goalLook.set(shot.look.x, shot.look.y, shot.look.z);
        const cut = this.lastView !== this.view || this.paused || this.goalPosition.distanceTo(this.camera.position) > 30;
        const follow = cut ? 1 : 1 - Math.exp(-frameSeconds * 5.5);
        this.camera.position.lerp(this.goalPosition, follow);
        this.cameraLook.lerp(this.goalLook, cut ? 1 : 1 - Math.exp(-frameSeconds * 8));
        this.camera.lookAt(this.cameraLook);
        if (Math.abs(this.camera.fov - shot.fieldOfView) > 0.01) {
            this.camera.fov = shot.fieldOfView;
            this.camera.updateProjectionMatrix();
        }
        this.lastView = this.view;
    }
}
BbMotionLab.ASSET_DIRECTORY = "../assets/kaykit/";
BbMotionLab.FIELDERS = ["pitcher", "catcher", "first", "second", "short", "third", "left", "center", "right"];
