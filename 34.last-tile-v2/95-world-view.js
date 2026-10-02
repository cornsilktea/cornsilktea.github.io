"use strict";
class LastTileWorldView {
    constructor(libs, canvas, env) {
        this.env = env;
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !env.touchDevice, powerPreference: "high-performance" });
        this.pixelRatio = Math.min(env.devicePixelRatio(), env.touchDevice ? LastTileWorldView.TOUCH_PIXEL_RATIO_LIMIT : LastTileWorldView.DESKTOP_PIXEL_RATIO_LIMIT);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(Palette.SKY);
        this.scene.fog = new THREE.Fog(Palette.SKY, 30, 78);
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
        this.scene.add(new THREE.HemisphereLight(Palette.SKY_LIGHT, Palette.GROUND_LIGHT, 1.05));
        const sun = new THREE.DirectionalLight(Palette.SUN_LIGHT, 1.6);
        sun.position.set(6, 16, 9);
        this.scene.add(sun);
        this.world = new THREE.Group();
        this.scene.add(this.world);
        this.quality = env.createQualityGovernor({
            steps: [() => this.lowerPixelRatio()],
            slowSec: LastTileWorldView.SLOW_FRAME_SECONDS,
            slowLimit: LastTileWorldView.SLOW_FRAME_LIMIT
        });
        env.onResize(() => this.resize());
        this.resize();
    }
    resize() {
        const size = this.env.viewport();
        this.renderer.setSize(size.width, size.height, false);
        this.camera.aspect = size.width / size.height;
        this.camera.fov = size.width / size.height < 0.9 ? 52 : 42;
        this.camera.updateProjectionMatrix();
    }
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    trackFrameTime(deltaSeconds) {
        this.quality.update(deltaSeconds);
    }
    lowerPixelRatio() {
        if (this.pixelRatio <= 1)
            return false;
        this.pixelRatio = Math.max(1, this.pixelRatio - LastTileWorldView.PIXEL_RATIO_STEP);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
        return true;
    }
}
LastTileWorldView.TOUCH_PIXEL_RATIO_LIMIT = 1.5;
LastTileWorldView.DESKTOP_PIXEL_RATIO_LIMIT = 2;
LastTileWorldView.PIXEL_RATIO_STEP = 0.25;
LastTileWorldView.SLOW_FRAME_SECONDS = 0.022;
LastTileWorldView.SLOW_FRAME_LIMIT = 90;
class CameraRig {
    constructor(camera, env) {
        this.camera = camera;
        this.env = env;
        this.focusX = 0;
        this.focusY = 0;
        this.focusZ = 0;
        this.initialized = false;
    }
    reset() {
        this.initialized = false;
    }
    follow(dt, subject, shownFloor) {
        const zoom = MathUtil.clamp(1.3 / this.camera.aspect, 1, 2.1);
        const height = CameraRig.HEIGHT * Math.pow(zoom, 0.8), depth = CameraRig.DEPTH * Math.pow(zoom, 0.8);
        const targetX = subject ? subject.x * CameraRig.FOLLOW_SHARE : 0;
        const targetZ = subject ? subject.z * CameraRig.FOLLOW_SHARE : 0;
        const targetY = subject ? subject.y : LastTileGeometry.floorY(shownFloor);
        if (!this.initialized) {
            this.focusX = targetX;
            this.focusY = targetY;
            this.focusZ = targetZ;
            this.initialized = true;
        }
        const ratio = Math.min(1, dt * 7);
        this.focusX += (targetX - this.focusX) * ratio;
        this.focusZ += (targetZ - this.focusZ) * ratio;
        const verticalRate = subject && subject.isFalling() ? 12 : 6;
        this.focusY = MathUtil.lerp(this.focusY, targetY, Math.min(1, dt * verticalRate));
        this.camera.position.set(this.focusX, this.focusY + height, this.focusZ + depth);
        this.camera.lookAt(this.focusX, this.focusY + 0.4, this.focusZ - 0.4);
    }
    showcase() {
        const y = LastTileGeometry.floorY(LastTileRules.FLOOR_COUNT - 1);
        const shift = this.env.viewport().width > 1000 ? 2.4 : 0;
        this.camera.position.set(-shift, y + 2.9, 7.4);
        this.camera.lookAt(-shift * 1.5, y + 1.2, 0);
    }
}
CameraRig.HEIGHT = 21;
CameraRig.DEPTH = 15;
CameraRig.FOLLOW_SHARE = 0.62;
class FloorPresenter {
    constructor(board, fade, env) {
        this.board = board;
        this.fade = fade;
        this.env = env;
        this.shown = LastTileRules.FLOOR_COUNT - 1;
        this.switching = false;
    }
    get shownFloor() { return this.shown; }
    showTop() {
        this.shown = LastTileRules.FLOOR_COUNT - 1;
        this.board.showUpTo(this.shown);
    }
    follow(subject) {
        if (!subject || !subject.isGrounded() || subject.floor() === this.shown || this.switching)
            return;
        this.fadeSwitch(subject.floor());
    }
    fadeSwitch(target) {
        this.switching = true;
        this.fade.style.opacity = "1";
        this.env.afterMs(FloorPresenter.FADE_MS, () => {
            this.shown = target;
            this.board.showUpTo(this.shown);
            this.fade.style.opacity = "0";
            this.env.afterMs(FloorPresenter.FADE_MS, () => { this.switching = false; });
        });
    }
}
FloorPresenter.FADE_MS = 150;
class SubjectSelector {
    constructor(localId) {
        this.localId = localId;
        this.spectated = null;
    }
    reset() {
        this.spectated = null;
    }
    subject(match) {
        const me = this.fighterOf(match, this.localId);
        if (me && !me.isOut())
            return me;
        const watched = this.spectated ? this.fighterOf(match, this.spectated) : null;
        if (watched && !watched.isOut())
            return watched;
        const alive = this.aliveContestants(match);
        if (alive.length) {
            this.spectated = alive[0].id;
            return alive[0].fighter;
        }
        return me || watched;
    }
    cycle(match) {
        const others = this.aliveContestants(match).filter((contestant) => contestant.id !== this.localId);
        if (!others.length)
            return;
        const at = others.findIndex((contestant) => contestant.id === this.spectated);
        this.spectated = others[(at + 1) % others.length].id;
    }
    fighterOf(match, id) {
        const contestant = match.contestant(id);
        return contestant ? contestant.fighter : null;
    }
    aliveContestants(match) {
        return match.contestants().filter((contestant) => !contestant.fighter.isOut());
    }
}
