"use strict";
class TowerClimbGame {
    constructor(libs, gauge) {
        this.libs = libs;
        this.gauge = gauge;
        this.state = "loading";
        this.sfx = new ClimbSfx();
        this.fresh = new ClimbFreshMarks();
        this.lastFrame = 0;
        this.countLeft = 0;
        this.warmed = false;
        this.speedrunNext = false;
        this.frame = 0;
        this.portalHint = "";
        this.shownStage = -1;
        this.handlers = {
            jump: () => this.sfx.play("jump"),
            land: (e) => { if (e.drop > 1.2)
                this.sfx.play("land"); },
            pad: () => this.sfx.play("pad"),
            grab: () => this.sfx.play("grab"),
            hop: () => this.sfx.play("grab"),
            fellHome: () => this.fell(),
            voidReturn: () => this.fell(),
            stageClear: (e) => this.cleared(e.stage),
            portalEnter: () => this.sfx.play("portal"),
            portalArrive: (e) => { this.view.avatar.playOnce("Spawn_Air", 0.7); this.hud.banner("스테이지 " + e.stage + " 시작점", false, 2); },
            hubArrive: () => this.view.avatar.playOnce("Spawn_Air", 0.7),
            knock: () => this.sfx.play("knock"),
            crumble: () => this.sfx.play("crumble"),
            summit: (e) => this.summit(e),
            speedrunStart: () => this.speedrunChanged("스피드런 시작! 꼭대기까지 달려요", true),
            speedrunExit: () => this.speedrunChanged("스피드런을 그만뒀어요 · 일반 모드", false),
            split: (e) => this.split(e.stage, e.seconds),
            speedrunFinish: (e) => this.speedrunFinish(e),
        };
        this.boot().catch((error) => this.gauge.fail("불러오지 못했어요: " + LoadGauge.describe(error)));
    }
    async boot() {
        const assets = new CharacterAssets(this.libs);
        assets.onProgress = (progress) => this.gauge.count("characters", progress);
        await assets.load();
        const library = new ClimbModelLibrary(this.libs);
        library.onProgress = (progress) => this.gauge.count("models", progress);
        await library.load(assets.clips);
        await this.gauge.phase("tower");
        const factory = new CharacterModelFactory(this.libs, assets);
        this.level = new TowerLevel(TowerLevelData.spec());
        this.startPanel = new ClimbStartPanel(this.level);
        this.practiceResult = new ClimbPracticeResult();
        this.speedrunResult = new ClimbSpeedrunResult();
        this.records = new ClimbRecords(() => this.recordsChanged());
        this.speedRecords = new ClimbSpeedRecords(() => this.recordsChanged());
        this.progress = new StageProgress(this.records.best.s);
        this.rules = new ClimbRules(this.level, this.progress);
        const touchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
        this.view = new ClimbWorldView(this.libs, ClimbDom.el("view"), library, factory, this.level, touchDevice, () => this.state === "play");
        await this.gauge.phase("ready");
        const profile = new PlayerProfile();
        this.view.avatar.wear(profile.look);
        profile.onChange(() => this.view.avatar.wear(profile.look));
        new ProfileEditor(this.libs, factory, assets, profile).mount(ClimbDom.el("profileHost"));
        FoldCard.bindAll(document);
        this.hud = new ClimbHud(this.level);
        const zone = ClimbDom.el("touchZone");
        this.keyboard = new KeyboardInput();
        this.touch = new TouchInput(zone, ClimbDom.el("joyBase"), ClimbDom.el("joyKnob"), ClimbDom.el("btnJump"), ClimbDom.el("btnSlow"), ClimbDom.el("btnPause"));
        for (const input of [this.keyboard, this.touch]) {
            input.onJump = () => this.rules.pressJump();
            input.onPause = () => this.pause();
        }
        this.keyboard.onPauseKey = () => this.togglePause();
        if (touchDevice)
            document.body.classList.add("touch");
        ClimbDom.el("btnStart").addEventListener("click", () => this.startRun(false));
        ClimbDom.el("btnResume").addEventListener("click", () => this.resume());
        ClimbDom.el("btnRestart").addEventListener("click", () => this.startRun(false));
        ClimbDom.el("btnQuit").addEventListener("click", () => this.showMenu());
        ClimbDom.el("btnAgain").addEventListener("click", () => this.startRun(false));
        ClimbDom.el("btnResultQuit").addEventListener("click", () => this.showMenu());
        ClimbDom.el("btnSpeedAgain").addEventListener("click", () => this.startRun(true));
        ClimbDom.el("btnSpeedQuit").addEventListener("click", () => this.startRun(false));
        this.syncPortals();
        this.view.quality.restore();
        this.gauge.finish();
        this.showMenu();
        requestAnimationFrame((now) => this.loop(now));
    }
    syncPortals() { this.view.portals.sync(this.progress, this.rules.mode); }
    recordsChanged() {
        if (!this.records || !this.speedRecords)
            return;
        this.startPanel.paint(this.records, this.speedRecords);
        if (!this.progress || !this.rules || this.records.best.s <= this.progress.cleared)
            return;
        this.progress.cleared = this.records.best.s;
        this.syncPortals();
    }
    setInputs(enabled) {
        for (const input of [this.keyboard, this.touch]) {
            input.enabled = enabled;
            if (!enabled)
                input.release();
        }
    }
    hideResults() { this.practiceResult.hide(); this.speedrunResult.hide(); }
    showMenu() {
        if (this.state === "play" || this.state === "pause")
            this.records.submitWorld(Math.floor(this.rules.peak + 1e-6));
        this.state = "menu";
        this.setInputs(false);
        this.hud.showPlay(false);
        ClimbDom.el("pauseBox").hidden = true;
        this.hideResults();
        ClimbDom.el("startScreen").hidden = false;
        this.rules = new ClimbRules(this.level, this.progress);
        this.syncPortals();
        this.view.builder.showAround(1);
        this.shownStage = -1;
        this.startPanel.paint(this.records, this.speedRecords);
    }
    startRun(speedrun) {
        this.rules = new ClimbRules(this.level, this.progress);
        this.syncPortals();
        this.view.rig.reset(0);
        this.fresh.clear();
        this.speedrunNext = speedrun;
        this.portalHint = "";
        this.countLeft = TowerClimbGame.COUNTDOWN;
        this.state = "countdown";
        ClimbDom.el("startScreen").hidden = true;
        ClimbDom.el("pauseBox").hidden = true;
        this.hideResults();
        this.hud.showPlay(true);
        this.hud.banner("", false, 0);
        this.setInputs(false);
    }
    pause() {
        if (this.state !== "play")
            return;
        this.state = "pause";
        this.setInputs(false);
        ClimbDom.el("pauseBox").hidden = false;
    }
    togglePause() {
        if (this.state === "play")
            this.pause();
        else if (this.state === "pause")
            this.resume();
    }
    resume() {
        if (this.state !== "pause")
            return;
        this.state = "play";
        ClimbDom.el("pauseBox").hidden = true;
        this.setInputs(true);
    }
    fell() {
        this.sfx.play("fall");
        this.records.submitWorld(Math.floor(this.rules.peak + 1e-6));
    }
    cleared(stage) {
        this.sfx.play("clear");
        this.records.offerStage(stage);
        this.syncPortals();
        this.view.avatar.playOnce("Cheering", 1.6);
        if (stage >= ClimbBalance.STAGE_COUNT)
            return;
        const opened = this.level.hasStage(stage + 1) ? " 포탈 " + (stage + 1) + "가 열렸어요" : "";
        this.hud.banner("스테이지 " + stage + " 클리어!" + opened, true, 4);
        this.records.submitWorld(Math.floor(this.rules.peak + 1e-6));
    }
    speedrunChanged(text, strong) {
        this.fresh.speed = false;
        this.syncPortals();
        this.portalHint = "";
        this.hud.banner(text, strong, 3);
    }
    split(stage, seconds) {
        const before = this.speedRecords.split(stage), delta = before ? " (" + ClimbText.delta(ClimbText.tenths(seconds) / 10 - before) + ")" : "";
        this.hud.banner("스테이지 " + stage + " · " + ClimbText.clock(seconds) + delta, true, 3);
    }
    reachTop() {
        this.sfx.play("summit");
        this.view.avatar.playOnce("Cheering", 3);
        if (this.records.offerHeight(ClimbBalance.TOP))
            this.fresh.height = true;
        this.records.submitWorld(ClimbBalance.TOP);
        this.state = "result";
        this.setInputs(false);
        this.rules.steer(0, 0);
    }
    summit(event) {
        this.reachTop();
        this.hud.banner("꼭대기 도착!", true, 3);
        this.practiceResult.show(event);
    }
    speedrunFinish(event) {
        const before = { t: this.speedRecords.best.t, sp: this.speedRecords.best.sp.slice() };
        this.reachTop();
        this.fresh.speed = this.speedRecords.offer(event);
        this.speedRecords.submitWorld(event);
        this.hud.banner("스피드런 완주! " + ClimbText.clock(event.seconds), true, 3);
        this.speedrunResult.show(event, before, this.fresh.speed);
    }
    dispatch(events) {
        for (const event of events) {
            const handler = this.handlers[event.t];
            if (handler)
                handler(event);
        }
    }
    steer(dt) {
        const rig = this.view.rig;
        this.keyboard.advance(dt);
        const moveX = Math.max(-1, Math.min(1, this.keyboard.moveX + this.touch.moveX)), moveY = Math.max(-1, Math.min(1, this.keyboard.moveY + this.touch.moveY));
        this.rules.steerStick(moveX, moveY, rig);
        this.rules.holdSlow(this.keyboard.slowHeld || this.touch.slowHeld);
        rig.turn(this.keyboard.takeLookX() + this.touch.takeLookX(), this.keyboard.takeLookY() + this.touch.takeLookY());
    }
    hints() {
        const body = this.rules.body;
        this.hud.hangHint(body.hanging, body.spot.ledge, this.touch.used || document.body.classList.contains("touch"));
        const hint = this.view.portals.hintNear(body.x, body.y, body.z, this.progress, this.rules.mode);
        if (hint !== this.portalHint) {
            this.portalHint = hint;
            if (hint)
                this.hud.banner(hint, false, 3);
        }
        const stage = Math.max(1, this.level.stageAt(body.y).index);
        if (stage !== this.shownStage) {
            this.shownStage = stage;
            this.view.builder.showAround(stage);
        }
    }
    playFrame(dt) {
        this.steer(dt);
        this.dispatch(this.rules.advance(dt));
        this.sfx.rate = this.rules.time.active ? 0.6 : 1;
        if (this.state === "play" && this.records.offerHeight(Math.floor(this.rules.peak + 1e-6)))
            this.fresh.height = true;
        if (this.frame % TowerClimbGame.HINT_EVERY === 0)
            this.hints();
    }
    countdownFrame(dt) {
        if (!this.warmed) {
            this.warmed = true;
            this.view.warmUp(this.progress, this.rules.mode);
        }
        this.countLeft -= dt;
        this.hud.countdown(this.countLeft > 0 ? String(Math.ceil(this.countLeft)) : "");
        if (this.countLeft > 0)
            return;
        this.state = "play";
        this.setInputs(true);
        if (!this.speedrunNext)
            return;
        this.rules.beginSpeedrun();
        this.dispatch(this.rules.events);
    }
    loop(now) {
        requestAnimationFrame((next) => this.loop(next));
        const dt = Math.min(TowerClimbGame.MAX_FRAME, Math.max(0, (now - this.lastFrame) / 1000));
        this.lastFrame = now;
        this.frame++;
        const view = this.view;
        if (this.state === "menu") {
            view.backdrop.update(dt);
            view.portals.update(dt);
            view.render();
            return;
        }
        if (this.state === "countdown")
            this.countdownFrame(dt);
        else if (this.state === "play")
            this.playFrame(dt);
        if (this.state === "result")
            this.dispatch(this.rules.advance(dt));
        const still = this.state === "pause" ? 0 : dt;
        view.builder.followRiders(this.rules.blend, this.rules.worldTime + (this.rules.blend - 1) * ClimbBalance.TICK);
        view.avatar.follow(this.rules, still);
        view.rig.follow(this.rules, view.avatar.root.position, still);
        view.portals.update(still * this.rules.time.scale);
        this.hud.update(this.rules, this.records, this.speedRecords, this.fresh, still);
        view.render();
        view.quality.update(dt);
    }
}
TowerClimbGame.COUNTDOWN = 3;
TowerClimbGame.HINT_EVERY = 4;
TowerClimbGame.MAX_FRAME = 0.1;
