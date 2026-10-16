"use strict";
class SnPlayOptions {
    constructor(search) {
        const params = new URLSearchParams(search);
        this.speed = Math.max(0.25, Math.min(8, Number(params.get("speed")) || 1));
        this.mode = params.get("mode") === "solo" ? "solo" : "duos";
        this.seed = Number(params.get("seed")) || Math.floor(Math.random() * 1e9);
        this.watchOnly = params.has("watch");
    }
}
class SnTimeText {
    static clock(seconds) {
        const s = Math.max(0, Math.floor(seconds));
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }
}
class SnSpectatorState {
    constructor() {
        this.watched = 0;
        this.overview = false;
        this.switchAt = -1;
    }
    pick(num) { this.watched = num; this.overview = false; this.switchAt = -1; }
    toggleOverview() { this.overview = !this.overview; }
    step(engine, delta) {
        const n = engine.players.length;
        for (let k = 1; k <= n; k++) {
            const num = (this.watched + delta * k + n * 4) % n;
            if (engine.players[num].life !== "out") {
                this.pick(num);
                return;
            }
        }
    }
    follow(engine, nowMs) {
        const p = engine.players[this.watched];
        if (!p || p.life !== "out") {
            this.switchAt = -1;
            return;
        }
        if (this.switchAt < 0) {
            this.switchAt = nowMs + 2000;
            return;
        }
        if (nowMs < this.switchAt)
            return;
        const mate = engine.teams[p.team].members.find((m) => m.life === "alive" || m.life === "down");
        const best = mate || engine.players.filter((m) => m.life === "alive").sort((a, b) => b.kills - a.kills)[0];
        if (best)
            this.pick(best.num);
        this.switchAt = -1;
    }
    startFrom(engine, me) {
        const mate = engine.teams[me.team].members.find((m) => m !== me && (m.life === "alive" || m.life === "down"));
        const killer = me.killedBy >= 0 ? engine.players[me.killedBy] : null;
        const target = mate || (killer && killer.life !== "out" ? killer : null) || engine.players.find((m) => m.life === "alive");
        this.pick(target ? target.num : me.num);
    }
}
class SnGame {
    constructor(libs) {
        this.libs = libs;
        this.options = new SnPlayOptions(location.search);
        this.hud = new SnHud();
        this.toast = new SnToast(SnDom.el("toast"));
        this.results = new SnResultBoard();
        this.spectator = new SnSpectatorState();
        this.specPanel = new SnSpectatorPanel();
        this.controls = null;
        this.scene = null;
        this.miniMap = null;
        this.bigMap = null;
        this.numbers = null;
        this.engine = null;
        this.profile = null;
        this.myNum = -1;
        this.spectating = false;
        this.carry = 0;
        this.lastMs = 0;
        this.shots = 0;
        this.resultShown = false;
        this.seed = this.options.seed;
        this.start().catch((error) => { SnDom.text(SnDom.el("loading"), "불러오기 실패: " + error); });
    }
    async start() {
        const assets = new CharacterAssets(this.libs);
        await assets.load();
        const library = new SnModelLibrary(this.libs);
        await library.load(assets.clips);
        const factory = new CharacterModelFactory(this.libs, assets);
        const canvas = SnDom.el("view");
        const touch = matchMedia("(pointer: coarse)").matches;
        const map = SnMap.shared();
        this.scene = new SnSceneView(this.libs, canvas, touch, library, factory, map);
        const painter = new SnMapPainter(map);
        this.bigMap = new SnBigMap(painter);
        this.miniMap = new SnMiniMap(painter, () => this.toggleMap());
        this.numbers = new SnDamageNumbers(SnDom.el("numLayer"));
        this.profile = new PlayerProfile();
        this.controls = new SnLocalControls(() => this.shots);
        this.controls.onMapKey(() => this.toggleMap());
        this.controls.useHeading(() => this.scene.world.rig.heading);
        this.controls.keyboard.onPress((code) => this.onSpectatorKey(code));
        canvas.addEventListener("pointerdown", (e) => this.pickActor(e.clientX, e.clientY));
        this.specPanel.onPick((num) => this.spectator.pick(num));
        this.specPanel.onOverview(() => this.spectator.toggleOverview());
        SnDom.el("btnAgain").addEventListener("click", () => { this.seed++; this.newMatch(); });
        document.body.classList.toggle("touch", touch);
        SnDom.show(SnDom.el("loading"), false);
        this.newMatch();
        this.lastMs = performance.now();
        requestAnimationFrame((ms) => this.frame(ms));
    }
    newMatch() {
        const scene = this.scene, profile = this.profile, controls = this.controls;
        const humans = this.options.watchOnly ? [] : [{ id: "me", nick: profile.nickOrDefault(), team: 0 }];
        const teams = this.options.watchOnly ? SnRosterPlanner.allBots(this.options.mode) : SnRosterPlanner.fill(this.options.mode, humans);
        const engine = new SnEngine({ seed: this.seed, mode: this.options.mode, teams });
        this.myNum = -1;
        engine.players.forEach((p) => {
            if (p.bot)
                engine.attach(p.num, new SnBotBrain(this.seed * 31 + p.num * 7919 + 1));
            else {
                engine.attach(p.num, new SnLocalPilot(controls));
                this.myNum = p.num;
            }
        });
        this.engine = engine;
        this.spectating = this.myNum < 0;
        this.spectator.pick(Math.max(0, this.myNum));
        this.resultShown = false;
        this.results.hide();
        controls.reset();
        const looks = new Map();
        if (this.myNum >= 0)
            looks.set(this.myNum, profile.look);
        scene.beginMatch(engine, looks, engine.snow.amount);
        scene.world.rig.snap();
        scene.world.rig.resetHeading(-Math.PI / 2);
        scene.world.playing = true;
        const leader = this.myNum >= 0 && engine.teams[engine.players[this.myNum].team].leader.num === this.myNum;
        this.bigMap.setPicking(leader, leader ? "낙하 지점을 누르세요" : "전체 지도", leader ? (x, z) => controls.queueDrop(x, z) : null);
        this.bigMap.setOpen(leader);
        if (this.myNum >= 0)
            this.toast.show(leader ? "지도를 눌러 낙하 지점을 고르세요 (20초)" : "팀장이 낙하 지점을 고르는 중이에요", 4, performance.now(), true);
    }
    toggleMap() {
        const big = this.bigMap, engine = this.engine;
        if (!engine)
            return;
        const me = this.myNum >= 0 ? engine.players[this.myNum] : null;
        const picking = !!me && me.life === "sky" && engine.teams[me.team].dropAt < 0 && engine.teams[me.team].leader === me;
        if (picking)
            return;
        big.setPicking(false, "전체 지도", null);
        big.setOpen(!big.open);
    }
    onSpectatorKey(code) {
        if (!this.spectating || !this.engine)
            return;
        if (code === "ArrowRight" || code === "KeyD")
            this.spectator.step(this.engine, 1);
        if (code === "ArrowLeft" || code === "KeyA")
            this.spectator.step(this.engine, -1);
    }
    pickActor(x, y) {
        if (!this.spectating || !this.scene)
            return;
        const num = this.scene.pickActor(x, y);
        if (num >= 0)
            this.spectator.pick(num);
    }
    onEvents(events, nowMs) {
        const engine = this.engine, numbers = this.numbers, watched = this.spectator.watched;
        for (const ev of events) {
            if (ev.t === "shot" && ev.by === this.myNum)
                this.shots++;
            else if (ev.t === "noSnow" && ev.id === this.myNum)
                this.toast.show("눈이 부족해요 — 눈 칸을 밟아 모으세요", 1.4, nowMs);
            else if (ev.t === "noWall" && ev.id === this.myNum)
                this.toast.show("여기에는 벽을 세울 수 없어요", 1.4, nowMs);
            else if (ev.t === "storm")
                this.toast.show(ev.what === "warn" ? "곧 " + ev.stage + "단계 눈보라가 줄어듭니다" : ev.what === "full" ? "눈보라가 섬을 덮었습니다" : ev.stage + "단계 눈보라가 줄어듭니다", 3, nowMs, true);
            else if (ev.t === "hit") {
                const to = engine.players[ev.to];
                const kind = ev.storm ? "storm" : ev.by === watched ? "mine" : ev.to === watched ? "hurt" : "other";
                if (ev.storm && ev.to !== watched)
                    continue;
                numbers.add("-" + Math.round(ev.v), kind, to.x, engine.map.heightAt(to.x, to.z) + 2.1, to.z, nowMs);
            }
            else if (ev.t === "down" && ev.by === this.myNum && ev.by >= 0)
                this.toast.show(engine.players[ev.id].nick + " 처치!", 2, nowMs, true);
            else if (ev.t === "down" && ev.id === this.myNum)
                this.toast.show(engine.mode === "duos" && engine.players[ev.id].canBeRevived() ? "얼어붙었어요! 아군이 부활시킬 수 있어요" : "얼어붙었어요!", 3, nowMs, true);
            else if (ev.t === "revive" && (ev.id === this.myNum || ev.by === this.myNum))
                this.toast.show(ev.id === this.myNum ? "부활했어요!" : engine.players[ev.id].nick + " 부활!", 2, nowMs, true);
            else if (ev.t === "crate" && ev.by === this.myNum && ev.taken)
                this.toast.show(this.itemText(engine.crates[ev.i].item), 1.8, nowMs);
            else if (ev.t === "crate" && ev.by === this.myNum && !ev.taken)
                this.toast.show("이미 같거나 더 좋은 것을 갖고 있어요 — 아군이 가져갈 수 있게 남겨 둡니다", 2, nowMs);
            else if (ev.t === "pile" && ev.by === this.myNum)
                this.toast.show("눈 더미 +" + SnBalance.SNOW.pile, 1.2, nowMs);
            else if (ev.t === "drop" && this.myNum >= 0 && ev.team === engine.players[this.myNum].team) {
                this.bigMap.setOpen(false);
                this.bigMap.setPicking(false, "전체 지도", null);
            }
        }
    }
    itemText(item) {
        if (item.kind === "cocoa")
            return "☕ 코코아! 체온 회복";
        if (item.kind === "big")
            return "⚪ 대형 눈덩이! 다음 공격은 굴리기";
        return SnHud.ICONS[SnGearRules.slotIndex(item.slot)] + " " + SnBalance.GRADE_NAMES[item.grade] + " " + SnHud.SLOT_NAMES[SnGearRules.slotIndex(item.slot)] + " 장착!";
    }
    marks(engine, viewerTeam) {
        const people = engine.players.filter((p) => (p.life !== "sky" || p.landAt >= 0) && p.life !== "out" && (viewerTeam < 0 || p.team === viewerTeam)).map((p) => ({
            x: p.x, z: p.z, yaw: p.yaw, color: SnPalette.teamColor(engine.mode, p.team), me: p.num === (this.spectating ? this.spectator.watched : this.myNum), down: p.life === "down",
        }));
        const pins = engine.teams.filter((t) => t.dropAt >= 0 && engine.time < SnBalance.DROP.pickLimit + SnBalance.DROP.time && (viewerTeam < 0 || t.num === viewerTeam)).map((t) => ({ x: t.dropX, z: t.dropZ, color: SnPalette.teamColor(engine.mode, t.num) }));
        return { storm: engine.stormNow(), crates: engine.crates, people, pins };
    }
    frame(ms) {
        requestAnimationFrame((next) => this.frame(next));
        const scene = this.scene, engine = this.engine, controls = this.controls;
        if (!scene || !engine || !controls)
            return;
        const dt = Math.min(0.1, (ms - this.lastMs) / 1000);
        this.lastMs = ms;
        this.carry += dt * this.options.speed;
        let steps = 0;
        while (this.carry >= SnGame.STEP && steps < 40) {
            this.carry -= SnGame.STEP;
            steps++;
            const events = engine.update(SnGame.STEP);
            scene.applyEvents(events, ms);
            this.onEvents(events, ms);
        }
        const me = this.myNum >= 0 ? engine.players[this.myNum] : null;
        if (me && !this.spectating && (me.life === "out" || engine.ended)) {
            this.spectating = true;
            this.spectator.startFrom(engine, me);
        }
        controls.enabled = !!me && me.life === "alive" && !this.spectating;
        if (this.spectating)
            this.spectator.follow(engine, ms);
        const watchedNum = this.spectating ? this.spectator.watched : this.myNum;
        const watched = engine.players[watchedNum] || null;
        const overview = this.spectating && this.spectator.overview;
        scene.sync(engine, dt, ms);
        const moving = !!watched && Math.hypot(watched.vx, watched.vz) > 0.3;
        const turn = moving && !!watched && Math.abs(SnAngle.wrap(watched.yaw - scene.world.rig.heading)) < SnCameraRig.CHASE_BACK_LIMIT;
        if (overview)
            scene.followEveryone(dt);
        else
            scene.followActor(watchedNum, dt, turn);
        const dist = Math.hypot(scene.world.rig.camera.position.x - scene.world.rig.focusX, scene.world.rig.camera.position.z - scene.world.rig.focusZ, scene.world.rig.camera.position.y - scene.world.rig.focusY);
        scene.setFog(Math.max(75, dist * 1.4), Math.max(180, dist * 2.6));
        if (watched && !overview)
            scene.hideTreesAround(watched.x, watched.z, dt);
        else
            scene.props.fadePines(false, dt);
        this.updateAim(scene, me);
        const storm = engine.stormNow();
        const edge = watched && watched.life === "alive" && !overview ? Math.hypot(watched.x - storm.x, watched.z - storm.z) - storm.r : -99;
        this.hud.showFrost(edge > 0 ? 0.75 + Math.sin(ms / 180) * 0.1 : edge > -3 ? 0.25 : 0);
        scene.render(dt, edge > 0);
        this.drawHud(engine, watched, overview, me, ms);
    }
    updateAim(scene, me) {
        const controls = this.controls;
        const angle = controls.aimWorldAngle();
        if (!me || !controls.enabled || angle === null) {
            scene.aimGuide.hide();
            return;
        }
        const y = scene.map.heightAt(me.x, me.z);
        const length = me.bigBall ? SnBalance.BIG.distance * 0.5 : SnBalance.SHOT.range;
        scene.aimGuide.show(controls.aimKind, me.x, y, me.z, angle, length);
    }
    drawHud(engine, watched, overview, me, ms) {
        const viewerTeam = this.spectating ? -1 : me ? me.team : -1;
        const marks = this.marks(engine, viewerTeam);
        this.hud.showTop(engine);
        this.hud.showPlayer(engine, overview ? null : watched, this.spectating);
        this.hud.showButtons(engine, me, !this.spectating && !!me && (me.life === "alive" || me.life === "sky"));
        SnDom.show(SnDom.el("touchZone"), !this.spectating);
        document.body.classList.toggle("spectating", this.spectating);
        const center = watched && !overview ? watched : null;
        this.miniMap.draw(center ? center.x : this.scene.world.rig.focusX, center ? center.z : this.scene.world.rig.focusZ, marks);
        this.bigMap.draw(marks);
        this.specPanel.show(this.spectating);
        if (this.spectating)
            this.specPanel.render(engine, this.spectator.watched, overview);
        const big = this.bigMap;
        if (me && me.life === "sky" && engine.teams[me.team].dropAt < 0 && engine.teams[me.team].leader === me) {
            SnDom.text(SnDom.el("bigMapTitle"), "낙하 지점을 누르세요 · " + Math.max(0, Math.ceil(SnBalance.DROP.pickLimit - engine.time)) + "초");
            if (!big.open)
                big.setOpen(true);
        }
        this.toast.update(ms);
        this.numbers.update(this.scene.world, ms);
        if (engine.ended && !this.resultShown && ms > 0) {
            this.resultShown = true;
            this.results.show(engine, this.myNum);
        }
    }
}
SnGame.STEP = 1 / 30;
