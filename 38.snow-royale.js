"use strict";
class SnPreviewOptions {
    constructor(search) {
        const params = new URLSearchParams(search);
        this.distance = Math.max(8, Math.min(140, Number(params.get("far")) || SnCameraRig.DISTANCE));
        this.speed = Math.max(0.25, Math.min(8, Number(params.get("speed")) || 1));
        this.mode = params.get("mode") === "solo" ? "solo" : "duos";
        this.seed = Number(params.get("seed")) || Math.floor(Math.random() * 1e9);
    }
}
class SnTimeText {
    static clock(seconds) {
        const s = Math.max(0, Math.floor(seconds));
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }
}
class SnPreviewOverlay {
    constructor() {
        this.box = document.getElementById("previewInfo");
    }
    show(engine, watched) {
        const storm = engine.stormNow();
        const alive = engine.teams.filter((t) => !t.out).length;
        const left = storm.phase === "full" ? "" : " · " + Math.max(0, Math.ceil(storm.phaseEnd - engine.time)) + "초";
        const lines = [
            "⏱ " + SnTimeText.clock(engine.time) + " · ❄ " + (storm.stage ? storm.stage + "단계 " + (storm.phase === "shrink" ? "줄어드는 중" : "대기") : "준비") + left + " · 남은 팀 " + alive,
        ];
        if (watched) {
            const gear = watched.gear.map((g, k) => ["모자", "옷", "신발"][k] + (g < 0 ? "-" : SnBalance.GRADE_NAMES[g])).join(" ");
            lines.push("관전: " + watched.nick + " · 체온 " + Math.ceil(Math.max(0, watched.hp)) + "/" + watched.maxHp + " · 눈 " + engine.teams[watched.team].snow + " · 처치 " + watched.kills + " · " + gear + (watched.bigBall ? " · 대형 눈덩이" : ""));
        }
        if (engine.ended)
            lines.push("끝! 5초 뒤 새 판");
        this.box.textContent = lines.join("\n");
    }
}
class SnGame {
    constructor(libs) {
        this.libs = libs;
        this.options = new SnPreviewOptions(location.search);
        this.overlay = new SnPreviewOverlay();
        this.scene = null;
        this.engine = null;
        this.watched = 0;
        this.carry = 0;
        this.lastMs = 0;
        this.endedAt = -1;
        this.seed = this.options.seed;
        this.start().catch((error) => { document.getElementById("previewInfo").textContent = "불러오기 실패: " + error; });
    }
    async start() {
        const assets = new CharacterAssets(this.libs);
        await assets.load();
        const library = new SnModelLibrary(this.libs);
        await library.load(assets.clips);
        const factory = new CharacterModelFactory(this.libs, assets);
        const canvas = document.getElementById("view");
        const touch = matchMedia("(pointer: coarse)").matches;
        this.scene = new SnSceneView(this.libs, canvas, touch, library, factory, SnMap.shared());
        if (this.options.distance > 30)
            this.scene.world.scene.fog = null;
        canvas.addEventListener("pointerdown", (e) => this.pick(e.clientX, e.clientY));
        window.addEventListener("keydown", (e) => this.onKey(e));
        this.newMatch();
        this.lastMs = performance.now();
        requestAnimationFrame((ms) => this.frame(ms));
    }
    newMatch() {
        const scene = this.scene;
        const teams = this.options.mode === "solo"
            ? [0, 1, 2, 3, 4, 5].map((k) => ({ members: [{ id: "b" + k, nick: "AI " + (k + 1), bot: true }] }))
            : [0, 1, 2].map((t) => ({ members: [0, 1].map((k) => ({ id: "b" + t + k, nick: "AI " + (t * 2 + k + 1), bot: true })) }));
        const engine = new SnEngine({ seed: this.seed, mode: this.options.mode, teams });
        engine.players.forEach((p) => engine.attach(p.num, new SnBotBrain(this.seed * 31 + p.num * 7919 + 1)));
        this.engine = engine;
        this.watched = 0;
        this.endedAt = -1;
        scene.beginMatch(engine, new Map(), engine.snow.amount);
        scene.world.rig.snap();
        scene.world.playing = true;
    }
    pick(x, y) {
        if (!this.scene)
            return;
        const num = this.scene.pickActor(x, y);
        if (num >= 0)
            this.watched = num;
    }
    onKey(e) {
        if (!this.engine)
            return;
        const step = e.key === "ArrowRight" || e.code === "KeyD" ? 1 : e.key === "ArrowLeft" || e.code === "KeyA" ? -1 : 0;
        if (!step)
            return;
        const n = this.engine.players.length;
        this.watched = (this.watched + step + n) % n;
    }
    frame(ms) {
        requestAnimationFrame((next) => this.frame(next));
        const scene = this.scene, engine = this.engine;
        if (!scene || !engine)
            return;
        const dt = Math.min(0.1, (ms - this.lastMs) / 1000);
        this.lastMs = ms;
        this.carry += dt * this.options.speed;
        const step = 1 / 30;
        let steps = 0;
        while (this.carry >= step && steps < 40) {
            this.carry -= step;
            steps++;
            const events = engine.update(step);
            scene.applyEvents(events, ms);
        }
        if (engine.ended && this.endedAt < 0)
            this.endedAt = ms;
        if (this.endedAt >= 0 && ms - this.endedAt > 5000) {
            this.seed++;
            this.newMatch();
            return;
        }
        const watched = engine.players[this.watched] || null;
        scene.sync(engine, dt, ms);
        scene.followActor(this.watched, dt, this.options.distance);
        const storm = engine.stormNow();
        const outside = !!watched && watched.life === "alive" && Math.hypot(watched.x - storm.x, watched.z - storm.z) > storm.r;
        scene.render(dt, outside);
        this.overlay.show(engine, watched);
    }
}
