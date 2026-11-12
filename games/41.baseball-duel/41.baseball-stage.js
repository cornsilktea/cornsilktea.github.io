"use strict";
class BbBroadcastShots {
    static pitcher() {
        return { position: BbFieldSpace.toWorld(-3.6, BbFieldGeometry.RUBBER_DISTANCE + 17, 7.2), look: BbFieldSpace.toWorld(0.5, 10, 0), fieldOfView: 19 };
    }
    static batter() {
        return { position: BbFieldSpace.toWorld(0, -2.7, 1.0), look: BbFieldSpace.toWorld(0, 10, 0.8), fieldOfView: 30 };
    }
}
class BbStage {
    constructor(libs, canvas) {
        this.libs = libs;
        this.casts = [new Map(), new Map()];
        this.fielding = 1;
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog("#cfe4f4", 260, 1000);
        this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 2400);
        this.cameraLook = new THREE.Vector3();
        this.goalPosition = new THREE.Vector3();
        this.goalLook = new THREE.Vector3();
        this.clock = new THREE.Clock();
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }
    resize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }
    async load(assetDirectory, park, cast) {
        const assets = new CharacterAssets(this.libs, assetDirectory);
        await assets.load();
        const factory = new CharacterModelFactory(this.libs, assets), gear = new BbGearFactory(this.libs);
        this.scene.add(new BbBallparkBuilder(this.libs, park).build());
        new BbParkLighting(this.libs).addTo(this.scene);
        this.createActors(0, factory, assets, gear, cast);
        this.createActors(1, factory, assets, gear, cast);
        this.field(1);
        this.ball = new BbBallActor(this.libs);
        this.zone = this.zoneFrame();
        this.scene.add(this.ball.mesh, this.ball.shadow, this.zone);
    }
    get metrics() { return this.actor("batter").poser.metrics; }
    actor(role) { return this.casts[this.fielding].get(role); }
    field(team) {
        this.fielding = team;
        this.casts.forEach((cast, index) => cast.forEach((actor) => { actor.root.visible = index === team; }));
    }
    zoneFrame() {
        const THREE = this.libs.THREE, corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const point = BbStrikeZoneBox.pointAt(u, v); return new THREE.Vector3(point.x, point.y, point.z); });
        return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75 }));
    }
    createActors(team, factory, assets, gear, cast) {
        const mine = new PlayerProfile().look, batterFlapOnLeft = !cast.batsLeft, fieldKit = BbStage.TEAM_KITS[team], batKit = BbStage.TEAM_KITS[1 - team];
        const make = (role, outfit) => {
            const actor = new BbPlayerActor(this.libs, factory, assets, gear, outfit);
            this.scene.add(actor.root);
            actor.root.visible = false;
            this.casts[team].set(role, actor);
        };
        BbStage.FIELDERS.forEach((role, index) => {
            const look = role === "pitcher" ? mine : CharacterLooks.clean({ c: index % 6, p: { skin: index % 5, hair: (index * 3) % 8 } });
            const gloveSide = role === "pitcher" && cast.throwsLeft ? "right" : "left";
            make(role, { look, kit: fieldKit, headGear: role === "catcher" ? "mask" : "cap", gloveSide, chestProtector: role === "catcher", carriesBat: false, flapOnLeft: false });
        });
        make("umpire", { look: CharacterLooks.clean({ c: 3, p: { skin: 2, hair: 0 } }), kit: BbTeamKits.UMPIRE, headGear: "mask", gloveSide: null, chestProtector: false, carriesBat: false, flapOnLeft: false });
        make("batter", { look: mine, kit: batKit, headGear: "helmet", gloveSide: null, chestProtector: false, carriesBat: true, flapOnLeft: batterFlapOnLeft });
        BbStage.RUNNERS.forEach((role) => make(role, { look: mine, kit: batKit, headGear: "helmet", gloveSide: null, chestProtector: false, carriesBat: false, flapOnLeft: batterFlapOnLeft }));
    }
    reset(script) {
        this.ball.forgetHolder();
        this.casts[this.fielding].forEach((actor, role) => actor.snapTo(script.starts.has(role) ? script.frameOf(role, 0) : null));
    }
    advance(script, seconds, deltaSeconds, hidden, zoneVisible) {
        this.casts[this.fielding].forEach((actor, role) => {
            actor.root.visible = script.starts.has(role) && hidden.indexOf(role) < 0;
            if (!actor.root.visible)
                return;
            actor.update(deltaSeconds, script.placementOf(role, seconds), script.frameOf(role, seconds), script.gaitOf(role, seconds), script.speedOf(role, seconds));
        });
        const state = script.ballAt(seconds), holder = state && state.holder ? this.actor(state.holder) : null;
        this.ball.update(state, holder, state && state.holder ? script.sideOf(state.holder, state.hand) : "right", deltaSeconds);
        this.zone.visible = zoneVisible;
    }
    aim(shot, frameSeconds, cut) {
        this.goalPosition.set(shot.position.x, shot.position.y, shot.position.z);
        this.goalLook.set(shot.look.x, shot.look.y, shot.look.z);
        const jump = cut || this.goalPosition.distanceTo(this.camera.position) > BbStage.CUT_DISTANCE;
        this.camera.position.lerp(this.goalPosition, jump ? 1 : 1 - Math.exp(-frameSeconds * BbStage.MOVE_FOLLOW));
        this.cameraLook.lerp(this.goalLook, jump ? 1 : 1 - Math.exp(-frameSeconds * BbStage.LOOK_FOLLOW));
        this.camera.lookAt(this.cameraLook);
        const narrow = shot.keepsWidth ? Math.max(1, BbStage.WIDTH_KEPT_ASPECT / this.camera.aspect) : 1;
        const fieldOfView = Math.min(BbStage.WIDEST_VIEW, 2 * Math.atan(Math.tan(shot.fieldOfView * Math.PI / 360) * narrow) * 180 / Math.PI);
        if (Math.abs(this.camera.fov - fieldOfView) > 0.01) {
            this.camera.fov = fieldOfView;
            this.camera.updateProjectionMatrix();
        }
    }
    run(onFrame) {
        this.renderer.setAnimationLoop(() => {
            onFrame(Math.min(BbStage.LONGEST_FRAME_SECONDS, this.clock.getDelta()));
            this.renderer.render(this.scene, this.camera);
        });
    }
}
BbStage.HIDDEN_BEHIND_PLATE = ["catcher", "umpire"];
BbStage.FIELDERS = ["pitcher", "catcher", "first", "second", "short", "third", "left", "center", "right"];
BbStage.RUNNERS = ["runner", "runnerFirst", "runnerSecond", "runnerThird"];
BbStage.TEAM_KITS = [BbTeamKits.AWAY, BbTeamKits.HOME];
BbStage.CUT_DISTANCE = 30;
BbStage.WIDTH_KEPT_ASPECT = 1.6;
BbStage.WIDEST_VIEW = 100;
BbStage.MOVE_FOLLOW = 5.5;
BbStage.LOOK_FOLLOW = 8;
BbStage.LONGEST_FRAME_SECONDS = 0.05;
