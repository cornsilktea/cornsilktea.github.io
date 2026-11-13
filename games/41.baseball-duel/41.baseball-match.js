"use strict";
class BbPitchClock {
    constructor(host) {
        this.left = 0;
        this.shown = -1;
        this.element = BbHudParts.box("bb-clock", host);
    }
    start(seconds) {
        this.left = seconds;
        this.shown = -1;
        this.element.classList.add("open");
        this.tick(0);
    }
    hide() {
        this.left = 0;
        this.element.classList.remove("open");
    }
    tick(frameSeconds) {
        if (this.left <= 0)
            return false;
        this.left -= frameSeconds;
        const whole = Math.max(0, Math.ceil(this.left));
        if (whole !== this.shown) {
            this.shown = whole;
            this.element.textContent = String(whole);
            this.element.classList.toggle("warn", whole <= BbPitchClock.WARN_SECONDS);
        }
        if (this.left > 0)
            return false;
        this.hide();
        return true;
    }
}
BbPitchClock.WARN_SECONDS = 5;
class BbLocalLink {
    constructor(director, seed) {
        this.director = director;
        this.seeds = new BbSeededRandom(seed ^ 0x2f6e2b1);
    }
    pitchChosen(sequence, call) { this.director.deliverPitch(sequence, call, this.seeds.seed()); }
    swingChosen(sequence, contactOffset) { this.director.deliverSwing(sequence, contactOffset); }
}
class BbMatchDirector {
    constructor(stage, hud, host, events) {
        this.stage = stage;
        this.hud = hud;
        this.events = events;
        this.queued = [];
        this.chance = new BbSeededRandom(1);
        this.pending = null;
        this.waitingForCall = false;
        this.running = false;
        this.staged = false;
        this.fast = false;
        this.idlePitches = 0;
        this.orbiting = false;
        this.halted = false;
        this.orbitAngle = 0;
        this.cards = new BbMatchupCards(host);
        this.toast = new BbCallToast(host);
        this.report = new BbPitchReport(host);
        this.clock = new BbPitchClock(host);
        this.ticker = new BbBoardTicker(hud);
        this.player = new BbScenePlayer(stage, hud, (call) => this.called(call));
        this.scenes = new BbSceneFactory(() => this.stage.metrics);
        this.pad = new BbPitchPad(host, (call) => this.humanThrows(call));
        this.swing = new BbSwingButton(host, () => this.humanSwings());
    }
    get isRunning() { return this.running; }
    get sequence() { return this.session.log.length; }
    get awaitsPitch() { return this.running && this.waitingForCall && !this.pending; }
    halt(on) { this.halted = on; }
    watch(view) {
        if (!this.plan || !this.plan.view)
            return;
        this.plan.view = view;
        this.player.view = view;
    }
    reseat(seats) {
        const changed = this.plan.seats[0] !== seats[0] || this.plan.seats[1] !== seats[1];
        this.plan.seats = seats;
        if (changed && this.running && this.waitingForCall && !this.pending)
            this.nextPitch();
    }
    get board() { return this.session.board(); }
    say(text, detail = "", seconds) { this.toast.show(text, detail, seconds); }
    quicken(on) { this.fast = on; }
    orbit(on) { this.orbiting = on; }
    preview(plan) {
        this.load(plan);
        this.running = false;
        this.waitingForCall = true;
        this.show();
        this.player.play(this.idleScene());
    }
    begin(plan, link) {
        this.load(plan);
        this.link = link;
        this.running = true;
        this.nextPitch();
    }
    stop() {
        this.running = false;
        this.pad.close();
        this.swing.hide();
        this.report.hide();
        this.clock.hide();
    }
    skipScene() {
        const pending = this.pending;
        if (!this.running || this.waitingForCall || (pending && (!pending.settled || !pending.announced)))
            return;
        this.player.skip();
    }
    deliverPitch(sequence, call, seed, swingOpen = true) {
        const session = this.session;
        if (!this.running || !this.waitingForCall || this.pending || sequence !== session.log.length)
            return;
        this.pad.close();
        this.clock.hide();
        this.waitingForCall = false;
        const roll = session.rollWith(call, seed), batter = session.batter(), seated = this.plan.seats[session.battingIndex], seat = seated === "human" && !swingOpen ? "remote" : seated;
        this.pending = {
            sequence, roll, setting: session.setting(), fielding: session.fieldingIndex, hands: this.hands(), pitcherHand: session.pitcher().hand, abilities: batter.abilities,
            leniency: BbBatterAbilityModel.leniency(batter.abilities.contact), settled: null, announced: false, started: false, batting: seat
        };
        if (seat === "ai") {
            this.link.swingChosen(sequence, session.aiSwing(roll, this.plan.level));
            return;
        }
        this.player.play(this.sceneOf(session.preview(roll)), seat === "remote" ? BbMatchDirector.REMOTE_LEAD : 0);
        this.pending.started = true;
        if (seat === "human")
            this.swing.arm();
    }
    deliverSwing(sequence, contactOffset) {
        const pending = this.pending;
        if (!this.running || !pending || pending.settled || pending.sequence !== sequence)
            return;
        this.swing.disarm();
        const settled = this.session.settle(pending.roll, contactOffset);
        pending.settled = settled;
        if (settled.note.halfOver && !this.isOver())
            this.scenes.swap(pending.fielding, pending.hands).forEach((swap) => this.queued.push(swap));
        this.events.onLog(this.session.log);
        const scene = this.sceneOf(settled.outcome);
        if (pending.started)
            this.player.replace(scene);
        else
            this.player.play(scene);
        pending.started = true;
    }
    tick(frameSeconds) {
        this.toast.tick(frameSeconds);
        this.pad.tick(frameSeconds);
        if (!this.staged)
            return;
        if (!this.running || this.waitingForCall || this.halted) {
            this.player.idle(frameSeconds);
            if (this.running && !this.halted && this.clock.tick(frameSeconds))
                this.pitchForIdler();
        }
        else
            this.advance(frameSeconds);
        if (!this.orbiting) {
            this.player.frame(frameSeconds);
            return;
        }
        this.orbitAngle += frameSeconds * BbMatchDirector.ORBIT_TURN;
        const radius = BbMatchDirector.ORBIT_RADIUS, center = BbMatchDirector.ORBIT_CENTER;
        this.stage.aim({ position: BbFieldSpace.toWorld(Math.sin(this.orbitAngle) * radius, center - Math.cos(this.orbitAngle) * radius, BbMatchDirector.ORBIT_HEIGHT), look: BbFieldSpace.toWorld(0, center, 0), fieldOfView: 42, keepsWidth: true }, frameSeconds, false);
    }
    load(plan) {
        this.plan = plan;
        this.chance = new BbSeededRandom(plan.seed + 17);
        this.session = new BbDuelSession(plan.format, BbBallparkRegistry.MAIN.dimensions, plan.teams, new BbSeededRandom(plan.seed + plan.log.length * BbMatchDirector.RESUME_STRIDE));
        this.session.restore(plan.log);
        this.hud.players(plan.names[0], plan.names[1]);
        this.queued.length = 0;
        this.pending = null;
        this.idlePitches = 0;
        this.staged = true;
        this.stop();
    }
    show() {
        const session = this.session, names = this.plan.names;
        this.ticker.begin(session.board());
        this.cards.show(names[session.battingIndex], session.batter(), names[session.fieldingIndex], session.pitcher(), session.board().pitches);
    }
    isOver() {
        const state = this.session.state, halves = this.plan.halvesToPlay;
        return state.finished || (halves !== null && state.halvesDone >= halves);
    }
    viewNow() {
        const seats = this.plan.seats, session = this.session;
        if (this.plan.view)
            return this.plan.view;
        return seats[session.fieldingIndex] === "human" ? "pitcher" : seats[session.battingIndex] === "human" ? "batter" : "pitcher";
    }
    hands() { return { batsLeft: this.session.batter().hand === "L", throwsLeft: this.session.pitcher().hand === "L" }; }
    idleScene() {
        const session = this.session, roll = session.rollWith({ pitch: "ft", aim: { u: 0, v: 0 } }, BbMatchDirector.IDLE_SEED);
        return this.scenes.pitch({ outcome: session.preview(roll), pitcherHand: session.pitcher().hand, abilities: session.batter().abilities, setting: session.setting() }, session.fieldingIndex, this.hands());
    }
    sceneOf(outcome) {
        const pending = this.pending;
        return this.scenes.pitch({ outcome, pitcherHand: pending.pitcherHand, abilities: pending.abilities, setting: pending.setting }, pending.fielding, pending.hands);
    }
    nextPitch() {
        if (this.isOver()) {
            this.finish(null);
            return;
        }
        const session = this.session, seat = this.plan.seats[session.fieldingIndex], sequence = session.log.length;
        this.player.view = this.viewNow();
        this.show();
        this.report.hide();
        this.swing.hide();
        this.waitingForCall = true;
        this.player.play(this.idleScene());
        if (seat === "human") {
            this.pad.open(session.pitcher());
            this.clock.start(BbMatchDirector.PITCH_SECONDS);
        }
        else if (seat === "ai")
            this.link.pitchChosen(sequence, session.aiCall(this.plan.level));
    }
    humanThrows(call) {
        if (!this.running || !this.waitingForCall || this.halted || this.plan.seats[this.session.fieldingIndex] !== "human")
            return;
        this.idlePitches = 0;
        this.link.pitchChosen(this.session.log.length, call);
    }
    pitchForIdler() {
        const session = this.session;
        if (!this.waitingForCall || this.plan.seats[session.fieldingIndex] !== "human")
            return;
        this.idlePitches++;
        if (this.idlePitches >= BbMatchDirector.FORFEIT_AFTER) {
            this.finish(session.fieldingIndex);
            return;
        }
        if (this.idlePitches >= BbMatchDirector.AWAY_AFTER)
            this.toast.show("자리 비움");
        this.link.pitchChosen(session.log.length, { pitch: session.lastThrown || "ft", aim: { u: this.chance.between(-0.5, 0.5), v: -0.5 } });
    }
    humanSwings() {
        const pending = this.pending;
        if (!pending || pending.settled || pending.batting !== "human" || this.halted)
            return;
        this.link.swingChosen(pending.sequence, this.player.seconds + BbTimingModel.SWING_DELAY - this.player.arriveAt);
    }
    called(call) {
        if (call.text)
            this.toast.show(call.text);
        if (call.tally)
            this.ticker.tally(call.tally, this.session.board());
    }
    announce(pending) {
        const settled = pending.settled, outcome = settled.outcome, play = outcome.script, session = this.session, names = this.plan.names;
        pending.announced = true;
        this.ticker.thrown(!!play && play.result !== "FOUL");
        const verdict = play ? BbMatchDirector.IN_PLAY_VERDICT : settled.note.toast || BbMatchDirector.PLAIN_CALLS[outcome.kind];
        this.report.show(pending.roll, verdict, outcome.swing, pending.leniency, this.player.view);
        if (play)
            return;
        this.ticker.settle(session.board());
        if (!settled.note.halfOver)
            this.cards.show(names[session.battingIndex], session.batter(), names[session.fieldingIndex], session.pitcher(), session.board().pitches);
        this.toast.show(verdict);
    }
    forfeit(team) { if (this.running)
        this.finish(team); }
    finish(forfeitedBy) {
        this.stop();
        this.events.onEnd({ plan: this.plan, state: this.session.state, forfeitedBy });
    }
    advance(frameSeconds) {
        const pending = this.pending, player = this.player, batting = pending ? pending.batting : "ai";
        const eased = this.fast && (!pending || (pending.announced && !!pending.settled.outcome.script));
        let step = frameSeconds * (eased ? BbMatchDirector.FAST_PACE : 1);
        if (pending && !pending.settled && batting === "remote")
            step = Math.min(step, Math.max(0, player.arriveAt - BbMatchDirector.HOLD_BEFORE - player.seconds));
        player.advance(step);
        if (pending && !pending.settled && batting === "human") {
            const auto = this.plan.autoSwingAt;
            if (auto !== null && player.seconds >= player.arriveAt + auto - BbTimingModel.SWING_DELAY)
                this.humanSwings();
            else if (player.seconds >= player.arriveAt + BbMatchDirector.SWING_CLOSES_AFTER)
                this.link.swingChosen(pending.sequence, null);
        }
        if (pending && pending.settled && !pending.announced && player.seconds >= player.arriveAt)
            this.announce(pending);
        if (!player.finished || (pending && !pending.settled))
            return;
        this.pending = null;
        const swap = this.queued.shift();
        if (!swap) {
            this.nextPitch();
            return;
        }
        this.swing.hide();
        this.ticker.begin(this.session.board());
        player.play(swap);
    }
}
BbMatchDirector.SWING_CLOSES_AFTER = 0;
BbMatchDirector.FAST_PACE = 2.2;
BbMatchDirector.PITCH_SECONDS = 12;
BbMatchDirector.REMOTE_LEAD = 0.8;
BbMatchDirector.HOLD_BEFORE = 0.42;
BbMatchDirector.AWAY_AFTER = 3;
BbMatchDirector.FORFEIT_AFTER = 5;
BbMatchDirector.IDLE_SEED = 41;
BbMatchDirector.ORBIT_RADIUS = 70;
BbMatchDirector.ORBIT_HEIGHT = 40;
BbMatchDirector.ORBIT_TURN = 0.05;
BbMatchDirector.ORBIT_CENTER = 22;
BbMatchDirector.RESUME_STRIDE = 7919;
BbMatchDirector.IN_PLAY_VERDICT = "타격";
BbMatchDirector.PLAIN_CALLS = { ball: "볼", calledStrike: "스트라이크!", swingMiss: "헛스윙", foul: "파울", inPlay: "" };
