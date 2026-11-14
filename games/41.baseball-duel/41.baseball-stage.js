"use strict";
class BbCrewDresser {
    static of(team, base, crew) {
        const order = team.pitchers.map((sheet, index) => ({ sheet, index })), roles = BbRosterPlan.PITCHER_SLOTS.map((slot) => slot.role);
        order.sort((a, b) => (roles.indexOf(a.sheet.role) - roles.indexOf(b.sheet.role)) || a.index - b.index);
        const pick = (list, index) => (list && list[index] ? CharacterLooks.clean(list[index]) : base);
        return {
            pitchers: order.map((entry) => ({ look: pick(crew ? crew.p : undefined, entry.index), hand: entry.sheet.hand })),
            batters: team.lineup.map((sheet, index) => ({ look: pick(crew ? crew.b : undefined, index), hand: sheet.hand, position: sheet.position || BbRosterPlan.DESIGNATED }))
        };
    }
    static aiCrew(team) {
        const look = (index) => CharacterLooks.clean({ c: (index * 5 + team * 3) % BbCrewDresser.AI_TYPES, p: { skin: (index + team) % 5, hair: (index * 3 + team) % 8 } });
        return { p: BbRosterPlan.pitcherRoles().map((_, index) => look(index + 9)), b: BbRosterPlan.BATTING_ORDER.map((_, index) => look(index)) };
    }
}
BbCrewDresser.AI_TYPES = 13;
class BbBroadcastShots {
    static pitcher() {
        return { position: BbFieldSpace.toWorld(-3.6, BbFieldGeometry.RUBBER_DISTANCE + 17, 7.2), look: BbFieldSpace.toWorld(0.5, 10, 0), fieldOfView: 19, keepsWidth: true };
    }
    static batter() {
        return { position: BbFieldSpace.toWorld(0, -2.7, 1.0), look: BbFieldSpace.toWorld(0, 10, -0.45), fieldOfView: 30 };
    }
}
class BbSparkBurst {
    constructor(libs) {
        this.age = BbSparkBurst.SECONDS;
        const THREE = libs.THREE, geometry = new THREE.BufferGeometry();
        this.places = new Float32Array(BbSparkBurst.COUNT * 3);
        this.speeds = new Float32Array(BbSparkBurst.COUNT * 3);
        geometry.setAttribute("position", new THREE.BufferAttribute(this.places, 3));
        this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: "#ff2a12", size: 0.24, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.points.frustumCulled = false;
        this.points.visible = false;
    }
    burst(at) {
        for (let index = 0; index < BbSparkBurst.COUNT; index++) {
            const turn = index * 2.399963, lift = ((index * 37) % 100) / 100, speed = 2.5 + ((index * 53) % 100) / 100 * 5;
            this.places.set([at.x, at.y, at.z], index * 3);
            this.speeds.set([Math.cos(turn) * speed * (1 - lift * 0.5), (lift * 1.6 - 0.3) * speed, Math.sin(turn) * speed * (1 - lift * 0.5)], index * 3);
        }
        this.age = 0;
        this.points.visible = true;
    }
    update(deltaSeconds) {
        if (!this.points.visible)
            return;
        this.age += deltaSeconds;
        for (let index = 0; index < BbSparkBurst.COUNT * 3; index += 3) {
            this.speeds[index + 1] -= BbSparkBurst.GRAVITY * deltaSeconds;
            for (let axis = 0; axis < 3; axis++)
                this.places[index + axis] += this.speeds[index + axis] * deltaSeconds;
        }
        this.points.geometry.attributes.position.needsUpdate = true;
        this.points.material.opacity = 1 - BbCurve.span(this.age, BbSparkBurst.SECONDS * 0.4, BbSparkBurst.SECONDS);
        this.points.visible = this.age < BbSparkBurst.SECONDS;
    }
    clear() { this.age = BbSparkBurst.SECONDS; this.points.visible = false; }
}
BbSparkBurst.COUNT = 48;
BbSparkBurst.SECONDS = 0.7;
BbSparkBurst.GRAVITY = 7;
class BbStage {
    constructor(libs, canvas) {
        this.libs = libs;
        this.casts = [new Map(), new Map()];
        this.fielding = 1;
        this.crowd = null;
        this.wardrobe = null;
        this.studio = null;
        this.tailor = null;
        this.bench = new Map();
        this.bullpens = [[], []];
        this.lineups = [[], []];
        this.pixelRatio = Math.min(window.devicePixelRatio, BbStage.PIXEL_RATIO_CAP);
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog("#cfe4f4", 260, 1000);
        this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 2400);
        this.cameraLook = new THREE.Vector3();
        this.goalPosition = new THREE.Vector3();
        this.goalLook = new THREE.Vector3();
        this.clock = new THREE.Clock();
        this.renderer.domElement.classList.add("bb-view");
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }
    resize() {
        const canvas = this.renderer.domElement, width = canvas.clientWidth || window.innerWidth, height = canvas.clientHeight || window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
    async load(assetDirectory, park, cast) {
        const assets = new CharacterAssets(this.libs, assetDirectory);
        await assets.load();
        const factory = new CharacterModelFactory(this.libs, assets), gear = new BbGearFactory(this.libs), builder = new BbBallparkBuilder(this.libs, park);
        this.scene.add(builder.build());
        this.crowd = new BbCrowdSystem(this.libs, builder.crowdSeats);
        this.scene.add(this.crowd.group);
        new BbParkLighting(this.libs).addTo(this.scene);
        this.wardrobe = new BbWardrobe(this.libs, factory, assets, gear);
        this.studio = new BbPortraitStudio(this.libs, this.wardrobe);
        this.tailor = { factory, assets };
        this.createActors(0, cast);
        this.createActors(1, cast);
        this.field(1);
        this.ball = new BbBallActor(this.libs);
        this.zone = this.zoneFrame();
        this.stamp = this.ballStamp();
        this.sparks = new BbSparkBurst(this.libs);
        this.scene.add(this.ball.mesh, this.ball.shadow, this.zone, this.stamp, this.sparks.points);
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
    ballStamp() {
        const THREE = this.libs.THREE, canvas = document.createElement("canvas");
        canvas.width = canvas.height = 96;
        const context = canvas.getContext("2d");
        context.fillStyle = "#f6f3ea";
        context.beginPath();
        context.arc(48, 48, 44, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#c8322b";
        context.lineWidth = 5;
        context.beginPath();
        context.arc(-6, 48, 44, -0.9, 0.9);
        context.stroke();
        context.beginPath();
        context.arc(102, 48, 44, Math.PI - 0.9, Math.PI + 0.9);
        context.stroke();
        const stamp = new THREE.Mesh(new THREE.CircleGeometry(BbBallActor.VISUAL_RADIUS, 20), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, side: THREE.DoubleSide }));
        stamp.visible = false;
        return stamp;
    }
    spark(at) { this.sparks.burst(at); }
    createActors(team, cast) {
        const mine = new PlayerProfile().look, batterFlapOnLeft = !cast.batsLeft, fieldKit = BbStage.TEAM_KITS[team], batKit = BbStage.TEAM_KITS[1 - team];
        const make = (role, outfit) => this.place(team, role, outfit);
        BbStage.FIELDERS.forEach((role, index) => {
            const look = role === "pitcher" ? mine : CharacterLooks.clean({ c: index % 6, p: { skin: index % 5, hair: (index * 3) % 8 } });
            const gloveSide = role === "pitcher" && cast.throwsLeft ? "right" : "left";
            make(role, { look, kit: fieldKit, headGear: role === "catcher" ? "mask" : "cap", gloveSide, chestProtector: role === "catcher", carriesBat: false, flapOnLeft: false });
        });
        make("umpire", { look: CharacterLooks.clean({ c: 3, p: { skin: 2, hair: 0 } }), kit: BbTeamKits.UMPIRE, headGear: "mask", gloveSide: null, chestProtector: false, carriesBat: false, flapOnLeft: false });
        make("batter", { look: mine, kit: batKit, headGear: "helmet", gloveSide: null, chestProtector: false, carriesBat: true, flapOnLeft: batterFlapOnLeft });
        BbStage.RUNNERS.forEach((role) => make(role, { look: mine, kit: batKit, headGear: "helmet", gloveSide: null, chestProtector: false, carriesBat: false, flapOnLeft: batterFlapOnLeft }));
    }
    benched(actor) {
        for (const kept of this.bench.values())
            if (kept === actor)
                return true;
        return false;
    }
    dressCrews(crews) {
        if (!this.wardrobe)
            return;
        const used = new Set();
        [0, 1].forEach((team) => {
            const crew = crews[team], fieldKit = BbStage.TEAM_KITS[team], batKit = BbStage.TEAM_KITS[team === 0 ? 1 : 0];
            crew.batters.forEach((batter) => {
                const role = BbStage.ROLE_OF[batter.position], actor = role ? this.casts[team].get(role) : null;
                if (role && actor && !BbWardrobe.sameLook(actor.outfit.look, batter.look))
                    this.place(team, role, { ...actor.outfit, look: batter.look });
            });
            this.bullpens[team] = crew.pitchers.map((pitcher) => this.reserve(used, "p", { look: pitcher.look, kit: fieldKit, headGear: "cap", gloveSide: pitcher.hand === "L" ? "right" : "left", chestProtector: false, carriesBat: false, flapOnLeft: false }));
            this.lineups[team] = crew.batters.map((batter) => this.reserve(used, "b", { look: batter.look, kit: batKit, headGear: "helmet", gloveSide: null, chestProtector: false, carriesBat: true, flapOnLeft: batter.hand !== "L" }));
        });
        this.bench.forEach((actor, key) => { if (!used.has(key)) {
            this.scene.remove(actor.root);
            this.bench.delete(key);
        } });
        [0, 1].forEach((team) => { this.mound(team, 0); this.atBat(team, 0); });
        this.field(this.fielding);
    }
    undressCrews() {
        this.bullpens = [[], []];
        this.lineups = [[], []];
    }
    mound(team, index) { this.swapIn(team, "pitcher", this.bullpens[team][index]); }
    atBat(team, index) { this.swapIn(team === 0 ? 1 : 0, "batter", this.lineups[team][index]); }
    reserve(used, kind, outfit) {
        const key = kind + "|" + outfit.kit.cap + "|" + outfit.gloveSide + "|" + outfit.flapOnLeft + "|" + JSON.stringify(outfit.look);
        let actor = this.bench.get(key);
        if (!actor) {
            actor = this.wardrobe.actor(outfit);
            actor.root.visible = false;
            this.scene.add(actor.root);
            this.bench.set(key, actor);
        }
        used.add(key);
        return actor;
    }
    swapIn(castTeam, role, actor) {
        const cast = this.casts[castTeam], old = cast.get(role);
        if (!actor || old === actor)
            return;
        if (!actor.root.parent)
            this.scene.add(actor.root);
        actor.root.visible = !!old && old.root.visible;
        if (old)
            old.root.visible = false;
        cast.set(role, actor);
    }
    place(team, role, outfit) {
        const old = this.casts[team].get(role), actor = this.wardrobe.actor(outfit);
        if (old && this.benched(old))
            old.root.visible = false;
        else if (old)
            this.scene.remove(old.root);
        this.scene.add(actor.root);
        actor.root.visible = false;
        this.casts[team].set(role, actor);
    }
    dress(looks) {
        if (!this.wardrobe)
            return;
        [0, 1].forEach((team) => {
            const other = team === 0 ? 1 : 0, pitcher = this.casts[team].get("pitcher");
            if (pitcher && !BbWardrobe.sameLook(pitcher.outfit.look, looks[team]))
                this.place(team, "pitcher", { ...pitcher.outfit, look: looks[team] });
            ["batter"].concat(BbStage.RUNNERS).forEach((role) => {
                const actor = this.casts[other].get(role);
                if (actor && !BbWardrobe.sameLook(actor.outfit.look, looks[team]))
                    this.place(other, role, { ...actor.outfit, look: looks[team] });
            });
        });
        this.field(this.fielding);
    }
    portrait(look, team) { return this.studio ? this.studio.shoot(look, BbStage.TEAM_KITS[team]) : null; }
    lookEditor(draft) { return this.tailor ? new ProfileEditor(this.libs, this.tailor.factory, this.tailor.assets, draft) : null; }
    cheer(moment, batting) { if (this.crowd)
        this.crowd.react(moment, batting); }
    tension(on) { if (this.crowd)
        this.crowd.tension(on); }
    get listener() { return new BbVec(this.camera.position.x, this.camera.position.y, this.camera.position.z); }
    qualitySteps() {
        return [
            () => !!this.crowd && this.crowd.slower(),
            () => this.smallerShadow(),
            () => this.lowerPixels(),
            () => !!this.crowd && this.crowd.thinner()
        ];
    }
    smallerShadow() {
        let changed = false;
        this.scene.traverse((node) => {
            const light = node;
            if (!light.isDirectionalLight || !light.castShadow || light.shadow.mapSize.x <= BbStage.SMALL_SHADOW)
                return;
            light.shadow.mapSize.set(BbStage.SMALL_SHADOW, BbStage.SMALL_SHADOW);
            if (light.shadow.map) {
                light.shadow.map.dispose();
                light.shadow.map = null;
            }
            changed = true;
        });
        return changed;
    }
    lowerPixels() {
        if (this.pixelRatio <= 1)
            return false;
        this.pixelRatio = Math.max(1, this.pixelRatio - BbStage.PIXEL_RATIO_STEP);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
        return true;
    }
    reset(script) {
        this.ball.forgetHolder();
        this.sparks.clear();
        this.casts[this.fielding].forEach((actor, role) => actor.snapTo(script.starts.has(role) ? script.frameOf(role, 0) : null));
    }
    advance(script, seconds, deltaSeconds, hidden, zoneVisible, mark = null) {
        this.casts[this.fielding].forEach((actor, role) => {
            actor.root.visible = script.starts.has(role) && hidden.indexOf(role) < 0;
            if (!actor.root.visible)
                return;
            actor.update(deltaSeconds, script.placementOf(role, seconds), script.frameOf(role, seconds), script.gaitOf(role, seconds), script.speedOf(role, seconds));
        });
        const state = script.ballAt(seconds, hidden), holder = state && state.holder ? this.actor(state.holder) : null;
        this.ball.update(state, holder, state && state.holder ? script.sideOf(state.holder, state.hand) : "right", deltaSeconds);
        this.zone.visible = zoneVisible;
        this.stamp.visible = !!mark;
        if (mark)
            this.stamp.position.set(mark.x, mark.y, mark.z);
        this.sparks.update(deltaSeconds);
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
            const frameSeconds = Math.min(BbStage.LONGEST_FRAME_SECONDS, this.clock.getDelta());
            onFrame(frameSeconds);
            if (this.crowd)
                this.crowd.update(frameSeconds, this.camera);
            this.renderer.render(this.scene, this.camera);
        });
    }
}
BbStage.HIDDEN_BEHIND_PLATE = ["catcher", "umpire"];
BbStage.FIELDERS = ["pitcher", "catcher", "first", "second", "short", "third", "left", "center", "right"];
BbStage.RUNNERS = ["runner", "runnerFirst", "runnerSecond", "runnerThird"];
BbStage.TEAM_KITS = [BbTeamKits.AWAY, BbTeamKits.HOME];
BbStage.ROLE_OF = { C: "catcher", "1B": "first", "2B": "second", "3B": "third", SS: "short", LF: "left", CF: "center", RF: "right", DH: null };
BbStage.CUT_DISTANCE = 30;
BbStage.WIDTH_KEPT_ASPECT = 1.6;
BbStage.WIDEST_VIEW = 100;
BbStage.MOVE_FOLLOW = 5.5;
BbStage.LOOK_FOLLOW = 8;
BbStage.LONGEST_FRAME_SECONDS = 0.05;
BbStage.PIXEL_RATIO_CAP = 1.5;
BbStage.PIXEL_RATIO_STEP = 0.25;
BbStage.SMALL_SHADOW = 512;
