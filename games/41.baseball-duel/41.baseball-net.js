"use strict";
class BbRoomRules {
    static assignSeats(plan) {
        const assign = {};
        plan.groups.forEach((group) => MkSeatAssign.peopleOf(group).slice(0, 1).forEach((id) => { assign[id] = group.code === plan.binder ? BbRoomRules.HOST_TEAM : 0; }));
        return assign;
    }
    static assignedTo(assign, team) {
        if (!assign)
            return null;
        return Object.keys(assign).find((id) => Number(assign[id]) === team) || null;
    }
    static setupOf(value) {
        if (!value || !BbAiLevel.ALL[value.level] || BbModeRules.ORDER.indexOf(value.mode) < 0)
            return BbRoomRules.BLANK_SETUP;
        return { mode: value.mode, level: value.level, ai: !!value.ai };
    }
    static teamOf(match, id) { return match.seats.s0 === id ? 0 : match.seats.s1 === id ? 1 : null; }
    static seatsFor(match, myId, hosting) {
        const kind = (id) => (id === myId ? "human" : id === BbRoomRules.AI_SEAT && hosting ? "ai" : "remote");
        return [kind(match.seats.s0), kind(match.seats.s1)];
    }
}
BbRoomRules.AI_SEAT = "ai";
BbRoomRules.RULES = { root: "baseballduel/rooms", seatCount: 2, spectatorSlot: 9, seatOrder: [0, 1], spectatorLimit: 8 };
BbRoomRules.VALUES = ["match", "setup", "end", "vsAt", "assign"];
BbRoomRules.HOST_TEAM = 1;
BbRoomRules.BLANK_SETUP = { mode: "match", level: "normal", ai: false };
class BbRoomLink {
    constructor(director, session, backend) {
        this.director = director;
        this.session = session;
        this.backend = backend;
        this.entries = new Map();
        this.asked = new Set();
        this.onEntry = (snapshot) => { this.entries.set(Number(snapshot.key), snapshot.val() || {}); this.pump(); };
        this.held = false;
        this.log = session.ref.child("log");
    }
    async open() {
        const snapshot = await this.log.once("value"), stored = snapshot.val() || {};
        Object.keys(stored).forEach((key) => this.entries.set(Number(key), stored[key]));
        this.log.on("child_added", this.onEntry);
        this.log.on("child_changed", this.onEntry);
        const done = [];
        for (let sequence = 0;; sequence++) {
            const entry = this.entries.get(sequence);
            if (!entry || !entry.p || !entry.r || !entry.s)
                return done;
            done.push({ pitch: BbRoomLink.pitchOf(entry.p), aim: BbRoomLink.aimOf(entry.p), seed: entry.r.seed >>> 0, contactOffset: BbRoomLink.offsetOf(entry.s) });
        }
    }
    close() {
        this.log.off("child_added", this.onEntry);
        this.log.off("child_changed", this.onEntry);
    }
    hold(on) { this.held = on; }
    pitchChosen(sequence, call) {
        this.claim(sequence + "/p", { t: call.pitch, u: Number(call.aim.u.toFixed(4)), v: Number(call.aim.v.toFixed(4)) });
    }
    swingChosen(sequence, contactOffset) {
        this.director.deliverSwing(sequence, contactOffset);
        this.claim(sequence + "/s", contactOffset === null ? { k: "take" } : { k: "swing", o: Number(contactOffset.toFixed(4)) });
    }
    pump() {
        const sequence = this.director.sequence, entry = this.entries.get(sequence), hosting = this.session.isHost();
        if (!entry || !entry.p)
            return;
        if (!entry.r) {
            if (hosting && !this.asked.has(sequence)) {
                this.asked.add(sequence);
                this.claim(sequence + "/r", { seed: Math.floor(Math.random() * 4294967296), at: this.backend.now() });
            }
            return;
        }
        const age = this.backend.now() - entry.r.at;
        if (this.director.awaitsPitch)
            this.director.deliverPitch(sequence, { pitch: BbRoomLink.pitchOf(entry.p), aim: BbRoomLink.aimOf(entry.p) }, entry.r.seed >>> 0, age < BbRoomLink.FRESH_MS);
        if (entry.s)
            this.director.deliverSwing(sequence, BbRoomLink.offsetOf(entry.s));
        else if (hosting && !this.held && age > BbRoomLink.TAKE_AFTER_MS && !this.asked.has(-1 - sequence)) {
            this.asked.add(-1 - sequence);
            this.claim(sequence + "/s", { k: "take" });
        }
    }
    claim(path, value) {
        this.log.child(path).transaction((current) => (current !== null && current !== undefined ? undefined : value)).catch(() => undefined);
    }
    static pitchOf(pitch) { return BbPitchCatalog.ALL.some((kind) => kind.id === pitch.t) ? pitch.t : "ft"; }
    static aimOf(pitch) {
        const reach = BbRoomLink.AIM_REACH, safe = (value) => (Number.isFinite(value) ? BbCurve.clamp(value, -reach, reach) : 0);
        return { u: safe(pitch.u), v: safe(pitch.v) };
    }
    static offsetOf(swing) {
        return swing.k === "swing" && typeof swing.o === "number" && Number.isFinite(swing.o) ? BbCurve.clamp(swing.o, -1, 1) : null;
    }
}
BbRoomLink.FRESH_MS = 2500;
BbRoomLink.TAKE_AFTER_MS = 7000;
BbRoomLink.AIM_REACH = 3;
class BbPresenceWatch {
    constructor(session) {
        this.present = new Set();
        this.onJoin = (snapshot) => { this.present.add(snapshot.key); };
        this.onLeave = (snapshot) => { this.present.delete(snapshot.key); };
        this.players = session.ref.child("players");
        this.players.on("child_added", this.onJoin);
        this.players.on("child_removed", this.onLeave);
    }
    close() {
        this.players.off("child_added", this.onJoin);
        this.players.off("child_removed", this.onLeave);
    }
    missing(match) {
        const ids = [match.seats.s0, match.seats.s1];
        return ids.find((id) => id !== BbRoomRules.AI_SEAT && !this.present.has(id)) || null;
    }
}
class BbPauseBanner {
    constructor(host) {
        this.waited = 0;
        this.resumeIn = 0;
        this.shown = "";
        this.element = BbHudParts.box("bb-pause", host);
    }
    get paused() { return this.waited > 0 || this.resumeIn > 0; }
    clear() {
        this.waited = 0;
        this.resumeIn = 0;
        this.write("");
    }
    step(frameSeconds, someoneMissing) {
        if (someoneMissing) {
            this.waited += frameSeconds;
            this.resumeIn = BbPauseBanner.RESUME_SECONDS;
            this.write("상대 재접속 대기 중 · " + Math.max(0, Math.ceil(BbPauseBanner.WAIT_SECONDS - this.waited)) + "초");
            return this.waited >= BbPauseBanner.WAIT_SECONDS;
        }
        if (this.waited <= 0)
            return false;
        this.resumeIn -= frameSeconds;
        if (this.resumeIn > 0) {
            this.write("다시 시작 " + Math.ceil(this.resumeIn));
            return false;
        }
        this.clear();
        return false;
    }
    write(text) {
        if (text === this.shown)
            return;
        this.shown = text;
        this.element.textContent = text;
        this.element.classList.toggle("open", !!text);
    }
}
BbPauseBanner.WAIT_SECONDS = 45;
BbPauseBanner.RESUME_SECONDS = 3;
