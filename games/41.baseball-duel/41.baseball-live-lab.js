"use strict";
class BbLiveLabAddress {
    static read() {
        const query = new URLSearchParams(location.search), freeze = query.get("freeze");
        return {
            view: query.get("cam") === "batter" ? "batter" : "pitcher",
            batsLeft: query.get("bat") === "L", throwsLeft: query.get("arm") === "L",
            seed: Number(query.get("seed") || BbLiveLabAddress.DEFAULT_SEED) || BbLiveLabAddress.DEFAULT_SEED,
            speed: Number(query.get("speed") || 1) || 1,
            skip: Math.max(0, Number(query.get("skip") || 0) || 0),
            freezeAt: freeze === null ? null : Number(freeze),
            plain: query.has("plain")
        };
    }
    static go(options, change) {
        const next = { ...options, ...change }, query = new URLSearchParams();
        if (next.view !== "pitcher")
            query.set("cam", next.view);
        if (next.batsLeft)
            query.set("bat", "L");
        if (next.throwsLeft)
            query.set("arm", "L");
        if (next.seed !== BbLiveLabAddress.DEFAULT_SEED)
            query.set("seed", String(next.seed));
        location.search = query.toString();
    }
}
BbLiveLabAddress.VIEWS = [["pitcher", "투수 시점"], ["batter", "타자 시점"]];
BbLiveLabAddress.DEFAULT_SEED = 41;
class BbLiveScoreLine {
    constructor(box) {
        this.box = box;
        this.shown = { inning: 7, half: 0, outs: 0, balls: 0, strikes: 0, score: [0, 0] };
    }
    pitching(live, title) { this.write(title, live.batterHand === "L" ? "좌타" : "우타"); }
    called(live, title) {
        this.shown = live.board;
        this.write(title, live.toast);
    }
    write(title, note) {
        const board = this.shown;
        this.box.textContent = board.inning + "회" + (board.half === 0 ? "초" : "말") + " · 손님 " + board.score[0] + " : " + board.score[1] + " 방장 · B" + board.balls + " S" + board.strikes + " O" + board.outs + " · " + title + " · " + note;
    }
}
class BbLiveLab {
    constructor(libs) {
        this.options = BbLiveLabAddress.read();
        this.bar = document.getElementById("labBar");
        this.status = document.getElementById("labStatus");
        this.director = new BbLiveDirector();
        this.seconds = 0;
        this.paused = false;
        this.cut = true;
        this.announced = false;
        this.speed = this.options.speed;
        this.view = this.options.view;
        this.stage = new BbStage(libs, document.getElementById("labView"));
        this.feed = new BbAiGameFeed(BbBallparkRegistry.MAIN.dimensions, this.options.batsLeft ? "L" : "R", this.options.throwsLeft ? "L" : "R", this.options.seed);
        this.score = new BbLiveScoreLine(this.status);
        this.start().catch((error) => { this.status.textContent = "불러오지 못했어요: " + error.message; });
    }
    async start() {
        await this.stage.load(BbLiveLab.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, this.options);
        this.buildBar();
        if (this.options.plain)
            document.body.classList.add("plain");
        for (let skipped = 0; skipped < this.options.skip; skipped++)
            this.feed.next();
        this.nextPitch();
        if (this.options.freezeAt !== null)
            this.freeze(this.options.freezeAt);
        this.stage.run((frameSeconds) => this.tick(frameSeconds));
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
        const views = BbLiveLabAddress.VIEWS, viewButtons = views.map(([name, label]) => this.button(label, name === this.view, () => {
            this.view = name;
            this.cut = true;
            viewButtons.forEach((button, index) => button.classList.toggle("on", views[index][0] === name));
        }));
        this.gap();
        this.button(this.options.batsLeft ? "좌타" : "우타", this.options.batsLeft, () => BbLiveLabAddress.go(this.options, { batsLeft: !this.options.batsLeft, view: this.view }));
        this.button(this.options.throwsLeft ? "좌투" : "우투", this.options.throwsLeft, () => BbLiveLabAddress.go(this.options, { throwsLeft: !this.options.throwsLeft, view: this.view }));
        this.gap();
        const speeds = BbLiveLab.SPEEDS, speedButtons = speeds.map(([value, label]) => this.button(label, value === this.speed, () => {
            this.speed = value;
            speedButtons.forEach((button, index) => button.classList.toggle("on", speeds[index][0] === value));
        }));
        const pause = this.button("일시정지", false, () => { this.paused = !this.paused; pause.classList.toggle("on", this.paused); });
        this.button("다음 공 ▶", false, () => this.nextPitch());
    }
    nextPitch() {
        this.live = this.feed.next();
        this.drill = new BbLiveCycleDrill(this.live);
        this.script = this.drill.build({ metrics: this.stage.metrics, batsLeft: this.options.batsLeft, throwsLeft: this.options.throwsLeft });
        this.seconds = 0;
        this.announced = false;
        this.cut = true;
        this.score.pitching(this.live, this.drill.title);
        this.stage.reset(this.script);
        this.advance(0);
    }
    freeze(seconds) {
        this.paused = true;
        for (let time = 0; time < seconds - 1e-9; time += BbActionSync.FRAME_SECONDS)
            this.advance(Math.min(BbActionSync.FRAME_SECONDS, seconds - time));
        this.advance(0);
    }
    advance(deltaSeconds) {
        this.seconds += deltaSeconds;
        const following = this.director.followsBall(this.drill, this.seconds);
        const hidden = this.view === "batter" && !following ? BbStage.HIDDEN_BEHIND_PLATE : [];
        this.stage.advance(this.script, this.seconds, deltaSeconds, hidden, this.seconds < this.drill.arriveAt + BbLiveLab.ZONE_LINGER_SECONDS);
        if (!this.announced && this.seconds >= this.drill.arriveAt) {
            this.announced = true;
            this.score.called(this.live, this.drill.title);
        }
    }
    tick(frameSeconds) {
        if (!this.paused) {
            this.advance(frameSeconds * this.speed);
            if (this.seconds > this.script.duration)
                this.nextPitch();
        }
        const state = this.script.ballAt(this.seconds);
        this.stage.aim(this.director.shot(this.view, this.drill, this.seconds, state ? state.point : null), frameSeconds, this.cut || this.paused);
        this.cut = false;
    }
}
BbLiveLab.ASSET_DIRECTORY = "../assets/kaykit/";
BbLiveLab.ZONE_LINGER_SECONDS = 0.15;
BbLiveLab.SPEEDS = [[1, "×1"], [0.5, "×0.5"], [0.2, "×0.2"]];
