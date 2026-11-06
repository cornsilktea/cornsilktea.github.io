"use strict";
/* 방 게임 공용: 연결이 잠깐 끊겨 서버가 내 자리를 지웠을 때 방이 남아 있으면 같은 자리를 다시 써 넣는다.
   끊김 자동 삭제(onDisconnect)는 한 번 터지면 사라지므로 다시 연결될 때마다 새로 건다. 30번 RoomSession.rejoinAfterDrop 과 같은 규칙. */
/* 새로고침·탭 복원 뒤 이어하기(30번 RoomResume 과 같은 규칙): 방 코드·내 아이디·내 정보를 이 탭 sessionStorage 에 적어 두고,
   페이지가 다시 열리면 RESUME_MS 안이고 방이 남아 있을 때 같은 아이디로 다시 들어간다. 직접 나가면 지운다. */
class RoomResumeStore {
    constructor(game) {
        this.game = game;
        this.timer = 0;
    }
    static newId() {
        return "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    }
    key() {
        return this.game + "_resume_v1";
    }
    read(now = Date.now()) {
        try {
            const raw = sessionStorage.getItem(this.key());
            if (!raw)
                return null;
            const entry = JSON.parse(raw);
            if (!entry || !entry.code || !entry.myId || now - entry.savedAt > RoomResumeStore.RESUME_MS)
                return null;
            return entry;
        }
        catch (error) {
            return null;
        }
    }
    identity() {
        const entry = this.read();
        return entry ? entry.myId : RoomResumeStore.newId();
    }
    save(code, myId, record) {
        if (!record)
            return;
        try {
            sessionStorage.setItem(this.key(), JSON.stringify({ code, myId, record, savedAt: Date.now() }));
        }
        catch (error) {
            return;
        }
    }
    clear() {
        this.stopKeepFresh();
        try {
            sessionStorage.removeItem(this.key());
        }
        catch (error) {
            return;
        }
    }
    keepFresh(current) {
        this.stopKeepFresh();
        this.timer = window.setInterval(() => {
            const now = current();
            if (now)
                this.save(now.code, now.myId, now.record);
        }, RoomResumeStore.SAVE_EVERY_MS);
    }
    stopKeepFresh() {
        if (this.timer)
            window.clearInterval(this.timer);
        this.timer = 0;
    }
    async rejoin(database, root) {
        const entry = this.read();
        if (!entry)
            return null;
        const room = database.ref(root + "/" + entry.code);
        try {
            const [statusSnapshot, playersSnapshot] = await Promise.all([room.child("status").once("value"), room.child("players").once("value")]);
            const players = playersSnapshot.val() || {};
            const hasHuman = Object.keys(players).some((id) => !players[id].isAI && !players[id].bot && !players[id].isBot);
            if (statusSnapshot.val() === null || !hasHuman) {
                this.clear();
                return null;
            }
            if (!players[entry.myId])
                await room.child("players/" + entry.myId).set(entry.record);
            return entry.code;
        }
        catch (error) {
            return null;
        }
    }
}
RoomResumeStore.RESUME_MS = 180000;
RoomResumeStore.SAVE_EVERY_MS = 20000;
/* 방장이 사라지면(끊김·나감) 남은 사람 중 한 명이 방장이 된다. 잠깐 끊겼다 돌아오는 방장을 기다리려고 GRACE_MS 뒤에 확정한다.
   방장이 바뀐 뒤 경기 상태를 어떻게 할지는 게임이 정한다(RkSession.onHostTakeover). */
class RoomHostSuccession {
    constructor(port) {
        this.port = port;
        this.timer = 0;
    }
    static successor(players, except = "") {
        const humans = Array.from(players.keys()).filter((id) => {
            const record = players.get(id);
            return id !== except && !record.isBot && !record.isAI;
        });
        humans.sort((a, b) => {
            const first = players.get(a);
            const second = players.get(b);
            const seat = Number(!!first.spectator) - Number(!!second.spectator);
            if (seat)
                return seat;
            const joined = first.joinedAt - second.joinedAt;
            return joined || (a < b ? -1 : 1);
        });
        return humans.length ? humans[0] : null;
    }
    check() {
        if (this.timer || this.port.leaving() || !this.hostMissing())
            return;
        this.timer = window.setTimeout(() => {
            this.timer = 0;
            if (this.port.leaving() || !this.hostMissing())
                return;
            if (RoomHostSuccession.successor(this.port.players()) === this.port.myId())
                this.port.ref().update({ hostPlayerId: this.port.myId() });
        }, RoomHostSuccession.GRACE_MS);
    }
    cancel() {
        if (this.timer)
            window.clearTimeout(this.timer);
        this.timer = 0;
    }
    handOver() {
        const next = RoomHostSuccession.successor(this.port.players(), this.port.myId());
        if (next)
            this.port.ref().update({ hostPlayerId: next });
        else
            this.port.ref().remove().catch(() => undefined);
    }
    hostMissing() {
        if (!this.port.hostLoaded() || !this.port.players().has(this.port.myId()))
            return false;
        const hostId = this.port.hostId();
        const host = hostId ? this.port.players().get(hostId) : null;
        return !host || !!host.isBot || !!host.isAI;
    }
}
RoomHostSuccession.GRACE_MS = 4000;
class RoomDropRecovery {
    constructor(host, db, mineFolders) {
        this.host = host;
        this.db = db;
        this.mineFolders = mineFolders;
    }
    arm(ref) {
        const myId = this.host.myId();
        this.mineFolders.forEach((folder) => ref.child(folder + "/" + myId).onDisconnect().remove());
    }
    disarm(ref) {
        const myId = this.host.myId();
        try {
            this.mineFolders.forEach((folder) => ref.child(folder + "/" + myId).onDisconnect().cancel());
        }
        catch (error) {
            return;
        }
    }
    watchConnection(ref) {
        this.host.subscribe(this.db.ref(".info/connected"), "value", (snapshot) => {
            if (snapshot.val() === true && this.host.room() === ref && !this.host.leaving())
                this.arm(ref);
        });
    }
    recover(saved, tries = 0) {
        const ref = this.host.room();
        if (!ref || this.host.leaving())
            return;
        if (!saved || tries >= RoomDropRecovery.TRIES) {
            this.host.exit(RoomDropRecovery.LOST_MESSAGE);
            return;
        }
        ref.child("status").once("value").then((statusSnapshot) => {
            if (this.host.room() !== ref || this.host.leaving())
                return undefined;
            const status = statusSnapshot.val();
            if (status === null) {
                this.host.exit(RoomDropRecovery.CLOSED_MESSAGE);
                return undefined;
            }
            const record = this.host.returnRecord(saved, status);
            if (!record) {
                this.host.exit(RoomDropRecovery.LOST_MESSAGE);
                return undefined;
            }
            return ref.child("players/" + this.host.myId()).set(record).then(() => {
                if (this.host.room() !== ref || this.host.leaving())
                    return;
                this.arm(ref);
                this.host.afterReturn();
            });
        }).catch(() => {
            if (this.host.room() === ref && !this.host.leaving())
                setTimeout(() => this.recover(saved, tries + 1), RoomDropRecovery.RETRY_MS);
        });
    }
}
RoomDropRecovery.TRIES = 3;
RoomDropRecovery.RETRY_MS = 1000;
RoomDropRecovery.CLOSED_MESSAGE = "방이 종료되었어요.";
RoomDropRecovery.LOST_MESSAGE = "연결이 끊겨 방에서 나왔어요.";
