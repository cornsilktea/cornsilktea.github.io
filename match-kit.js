"use strict";
// 랜덤 매칭 공용 모듈(Mk*). 모든 대전 게임이 같이 쓴다 — 게임마다 복사하지 않는다.
// 구조와 이유는 random-match-prompt.md. 요약:
//  - 팀 대기실(MkParty): <게임>/parties/<5자리 코드>. 팀원·아군 AI 수·팀장·전적을 둔다.
//    코드는 일반 방(<게임>/rooms/<코드>)과 겹치지 않게 만들어서, 기존 "방 코드로 입장" 칸 하나로 둘 다 받는다.
//  - 대기열(MkQueue): matchQueue/<대기열 이름>/<팀 코드>. 팀 하나가 항목 하나.
//  - 묶기(MkBinder): 대기열에서 가장 먼저 들어온 "준비된" 항목의 팀장만 묶는다. 준비 = 들어온 지 3초가 지남.
//    여러 명이 동시에 묶지 않게 대기열 전체를 transaction 으로 차지(claim)한다. 차지한 사람이 방을 못 만들고
//    사라지면 차지는 CLAIM_EXPIRE 뒤 풀린다.
//  - 묶는 규칙은 MkMatcher 를 이은 클래스(1대1·팀 대 팀 = MkVersusMatcher, 여럿이 한 방 = MkFreeForAllMatcher)가 정한다.
//    일반 방을 실제로 만드는 일은 게임마다 다르므로 게임이 MkRoomMaker 를 넘긴다.
//  - 대기열은 on('value') 구독으로만 본다(폴링 없음). 3초 대기는 기기 안 타이머로 다시 계산만 한다.
// 이 파일은 화면과 무관한 부분(Node 시뮬레이터 tools/match-sim.js 가 그대로 불러 검사)과
// 계정별 연승(MkPersonalStreak)·연승 표시(MkStreakBadge)로 나뉜다. 모양은 theme.css 의 .mk-* .
// 랜덤 매칭 맵 고르기(2026-10-28 선생님 요청: 24번 맵이 계속 비슷하게 나온다).
// 매칭된 모든 사람의 바로 전 맵을 빼고 남은 맵 중에서 plan.seed 로 고른다. 다 빠지면 전체에서 고른다.
class MkRecentMaps {
    static clean(list) {
        if (!Array.isArray(list))
            return null;
        const maps = list.filter((item) => typeof item === "string" && item.length > 0 && item.length <= 40).slice(0, MkRecentMaps.KEEP);
        return maps.length ? maps : null;
    }
    static noted(list, map) {
        return [map].concat((MkRecentMaps.clean(list) || []).filter((item) => item !== map)).slice(0, MkRecentMaps.KEEP);
    }
    static avoidOf(plan) {
        const avoid = [];
        plan.groups.forEach((group) => Object.keys(group.entry.people || {}).forEach((id) => {
            (MkRecentMaps.clean(group.entry.people[id].recentMaps) || []).slice(0, MkRecentMaps.AVOID_LAST).forEach((map) => { if (avoid.indexOf(map) < 0)
                avoid.push(map); });
        }));
        return avoid;
    }
    static pick(maps, plan) {
        const avoid = MkRecentMaps.avoidOf(plan);
        const fresh = maps.filter((map) => avoid.indexOf(map) < 0);
        const pool = fresh.length ? fresh : maps;
        return pool[Math.abs(plan.seed) % pool.length];
    }
}
MkRecentMaps.KEEP = 2;
MkRecentMaps.AVOID_LAST = 1;
class MkPaths {
    constructor(queue, parties, rooms) {
        this.queue = queue;
        this.parties = parties;
        this.rooms = rooms;
    }
    static forGame(gameRoot, queueName) {
        return new MkPaths("matchQueue/" + queueName, gameRoot + "/parties", gameRoot + "/rooms");
    }
    party(code) {
        return this.parties + "/" + code;
    }
    entry(code) {
        return this.queue + "/" + code;
    }
}
// 묶기 규칙의 공통 부분: 누가 준비됐는지, 누가 묶을 차례인지, 다음에 언제 다시 볼지.
// 어떤 항목을 몇 개 고르고 어느 편에 넣는지는 자식 클래스가 정한다.
// 시간 값의 이유:
//  - rematchWaitMs(40초): 방금 붙은 두 팀만 대기열에 있고 다른 팀이 경기 중이면, 그 팀이 돌아올 때까지 이만큼 기다렸다가
//    그래도 없으면 다시 붙인다. AI 와 한 판 한 팀은 AI 대체(30초)만큼 늦게 끝나므로 그보다 길어야 섞인다.
//  - busyMs(4분): 경기 중 표지판이 스스로 사라지는 시간(30번 드래프트+경기+결과가 3분 남짓).
//  - returnGraceMs(25초): 판이 끝나 팀 대기실로 돌아온 팀이 "매칭 시작"을 다시 누를 때까지 기다려 주는 시간.
class MkMatcher {
    constructor(partyLimit, timing = MkMatcher.TIMING) {
        this.partyLimit = partyLimit;
        this.timing = timing;
    }
    // 두 항목이 서로 만나도 되는지. 기본은 누구와도 만난다(승률 구간 매칭이 덮어씀).
    canMeet(_a, _b) {
        return true;
    }
    get rematchWaitMs() {
        return this.timing.rematchWaitMs ?? MkMatcher.TIMING.rematchWaitMs;
    }
    get busyMs() {
        return this.timing.busyMs ?? MkMatcher.TIMING.busyMs;
    }
    get returnGraceMs() {
        return this.timing.returnGraceMs ?? MkMatcher.TIMING.returnGraceMs;
    }
    static metRecently(a, b) {
        return (a[1].avoid || []).indexOf(b[0]) >= 0 || (b[1].avoid || []).indexOf(a[0]) >= 0;
    }
    static isSign(entry) {
        return !!entry && !(entry.size > 0) && !!entry.busyUntil;
    }
    anchor(entries, now) {
        const ready = this.ready(entries, now);
        return ready.length ? ready[0][0] : null;
    }
    // 나 말고 지금 묶일 수 있는 팀이 대기열에 있는지. 있으면 AI 대체를 미룬다(사람끼리 붙는 게 먼저).
    hasCompany(entries, now, myCode) {
        return this.ready(entries, now).some(([code]) => code !== myCode);
    }
    // 곧 묶일 수 있게 될 팀: 경기 중 표지판, 또는 막 들어와 아직 준비(settleMs) 중인 팀. onlyOwed 면 AI 와 한 판 한 팀만 센다.
    othersComing(entries, now, onlyOwed) {
        return Object.keys(entries || {}).some((code) => {
            const entry = entries[code];
            if (!entry || (onlyOwed && !entry.owed))
                return false;
            if (MkMatcher.isSign(entry))
                return entry.busyUntil > now;
            return entry.size > 0 && entry.at + this.timing.settleMs > now;
        });
    }
    plan(entries, now, random) {
        const ready = this.ready(entries, now);
        if (!ready.length)
            return null;
        const picked = this.pick(ready, { now, othersComing: this.othersComing(entries, now, false), owedComing: this.othersComing(entries, now, true) });
        if (!picked || picked[0][0] !== ready[0][0])
            return null;
        const sides = this.sides(picked.length, random);
        return {
            matchId: ready[0][0] + "-" + now.toString(36) + "-" + Math.floor(random() * 1e6).toString(36),
            seed: Math.floor(random() * 2147483647),
            binder: ready[0][0],
            groups: picked.map(([code, entry], index) => ({ code, entry, side: sides[index] })),
        };
    }
    isFree(entry, now) {
        return !entry.claim || now - entry.claim.at > this.timing.claimExpireMs;
    }
    nextCheck(entries, now) {
        let next = null;
        Object.keys(entries || {}).forEach((code) => {
            const entry = entries[code];
            if (!entry)
                return;
            const moments = MkMatcher.isSign(entry) ? [entry.busyUntil + 1] : [entry.at + this.timing.settleMs, entry.at + this.timing.settleMs + this.rematchWaitMs + 1];
            if (entry.claim)
                moments.push(entry.claim.at + this.timing.claimExpireMs + 1);
            moments.forEach((moment) => {
                if (moment > now && (next === null || moment < next))
                    next = moment;
            });
        });
        return next;
    }
    // 지난 판을 AI 와 한 팀(owed)이 맨 앞 — 팀 수가 홀수일 때 AI 와 하는 차례가 한 팀에 몰리지 않고 돌아가게.
    // 나머지는 먼저 온 순서.
    ready(entries, now) {
        return Object.keys(entries || {})
            .map((code) => [code, entries[code]])
            .filter(([, entry]) => entry && entry.size > 0 && entry.at + this.timing.settleMs <= now && this.isFree(entry, now))
            .sort((a, b) => (a[1].owed ? 0 : 1) - (b[1].owed ? 0 : 1) || a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));
    }
}
MkMatcher.TIMING = { settleMs: 3000, claimExpireMs: 10000, rematchWaitMs: 40000, busyMs: 240000, returnGraceMs: 25000 };
// 두 편이 맞붙는 게임(24·25·30·34·35): 맨 앞 팀과 그다음 준비된 팀을 묶고 편은 무작위.
// 바로 전 판 상대(avoid)는 건너뛰고, 그 상대밖에 없으면 경기 중인 다른 팀(표지판)이 있을 때만 rematchWaitMs 까지 기다린다.
// AI 와 한 판 한 팀이 곧 돌아오는데 남은 팀이 딱 둘이면, 둘을 묶지 않고 잠깐 기다린다 — 그래야 그 팀이 또 혼자 남아
// AI 를 연달아 만나지 않고, 대신 남은 둘 중 한 팀이 다음 AI 차례가 된다(팀 수가 홀수일 때 AI 차례 돌리기).
class MkVersusMatcher extends MkMatcher {
    pick(ready, context) {
        const fitting = ready.filter(([, entry]) => entry.size <= this.partyLimit);
        if (fitting.length < 2 || fitting[0] !== ready[0])
            return null;
        const first = fitting[0];
        const holding = context.now - (first[1].at + this.timing.settleMs) < this.rematchWaitMs;
        if (holding && fitting.length === 2 && context.owedComing && !first[1].owed)
            return null;
        const fresh = fitting.slice(1).find((other) => !MkMatcher.metRecently(first, other));
        if (fresh)
            return [first, fresh];
        if (holding && context.othersComing)
            return null;
        return [first, fitting[1]];
    }
    sides(count, random) {
        return random() < 0.5 ? [0, 1] : [1, 0];
    }
}
// 승률이 크게 다른 학생끼리 만나지 않게 한다(2026-10-27 선생님 요청, 24번):
// 승률 30% 미만은 승률 50% 미만인 상대만, 70% 이상은 50% 이상인 상대만 기다린다(양쪽 모두 만족해야 묶임).
// 판 수가 적으면 승률이 한두 판에 크게 흔들리므로 MIN_GAMES 판부터 적용하고, 기록이 없는 쪽(로그인 안 함·새 학생)은 누구와도 만난다.
// 끝내 맞는 상대가 없으면 기존 AI 대체(aiFallbackMs)가 받아 준다. 팀 항목은 팀원 승패를 합쳐 본다.
class MkWinBand {
    static rateOf(entry) {
        let games = 0, wins = 0;
        Object.keys(entry.people || {}).forEach((id) => {
            const rate = entry.people[id].rate;
            if (!rate)
                return;
            games += Number(rate.g) || 0;
            wins += Number(rate.w) || 0;
        });
        return games >= MkWinBand.MIN_GAMES ? wins / games : null;
    }
    static accepts(own, other) {
        if (own === null || other === null)
            return true;
        if (own < MkWinBand.LOW)
            return other < MkWinBand.MID;
        if (own >= MkWinBand.HIGH)
            return other >= MkWinBand.MID;
        return true;
    }
    static fits(a, b) {
        const rateA = MkWinBand.rateOf(a), rateB = MkWinBand.rateOf(b);
        return MkWinBand.accepts(rateA, rateB) && MkWinBand.accepts(rateB, rateA);
    }
    // Firebase 는 undefined 를 못 쓰므로 없는 값은 null 로, 숫자는 0 이상 정수로.
    static clean(rate) {
        if (!rate)
            return null;
        const g = Math.max(0, Math.floor(Number(rate.g) || 0));
        return { g, w: Math.min(g, Math.max(0, Math.floor(Number(rate.w) || 0))) };
    }
}
MkWinBand.LOW = 0.3;
MkWinBand.HIGH = 0.7;
MkWinBand.MID = 0.5;
MkWinBand.MIN_GAMES = 5;
// 1대1·팀 대 팀 묶기에 승률 구간을 더한 것. 맞는 상대가 하나도 없는 항목은 "준비된 항목"에서 빼서
// 그 항목이 맨 앞에 있어도 다른 학생들끼리의 묶기를 막지 않게 한다(묶는 사람은 준비된 항목 중 맨 앞).
class MkWinBandVersusMatcher extends MkVersusMatcher {
    canMeet(a, b) {
        return MkWinBand.fits(a, b);
    }
    hasCompany(entries, now, myCode) {
        const mine = entries ? entries[myCode] : null;
        if (!mine)
            return super.hasCompany(entries, now, myCode);
        return this.ready(entries, now).some(([code, entry]) => code !== myCode && this.canMeet(mine, entry));
    }
    ready(entries, now) {
        const all = super.ready(entries, now);
        return all.filter((item) => all.some((other) => other !== item && this.canMeet(item[1], other[1])));
    }
    pick(ready, context) {
        if (!ready.length)
            return null;
        const first = ready[0];
        return super.pick([first].concat(ready.slice(1).filter((other) => this.canMeet(first[1], other[1]))), context);
    }
}
// 여럿이 한 방에 모이는 게임(31·32·38·39): 먼저 온 순서로 정원까지 채우고, 넘치는 항목은 다음 묶음으로.
// maxEntries: 한 방에 들어갈 수 있는 팀(항목) 수 상한(예: 38번 팀전은 3팀).
class MkFreeForAllMatcher extends MkMatcher {
    constructor(partyLimit, capacity, timing = MkMatcher.TIMING, maxEntries = Infinity) {
        super(partyLimit, timing);
        this.capacity = capacity;
        this.maxEntries = maxEntries;
    }
    pick(ready, _context) {
        const picked = [];
        let people = 0;
        ready.forEach((item) => {
            if (picked.length < this.maxEntries && item[1].size <= this.partyLimit && people + item[1].size <= this.capacity) {
                picked.push(item);
                people += item[1].size;
            }
        });
        return picked.length >= 2 && picked[0] === ready[0] ? picked : null;
    }
    sides(count) {
        const sides = [];
        for (let index = 0; index < count; index++)
            sides.push(index);
        return sides;
    }
}
// 전적에서 합계·연승을 계산한다. 연승은 따로 저장하지 않고 전적 끝에서부터 센다(진실은 한 곳).
class MkRecordBook {
    constructor(history) {
        this.lines = Object.keys(history || {}).map((key) => history[key]).sort((a, b) => a.n - b.n);
    }
    count(result) {
        return this.lines.filter((line) => line.result === result).length;
    }
    // 무승부는 연승을 끊지도 늘리지도 않는다(2026-10-22 선생님 요청). 패배를 만나면 거기서 멈춘다.
    streak() {
        let wins = 0;
        for (let index = this.lines.length - 1; index >= 0 && this.lines[index].result !== "lose"; index--) {
            if (this.lines[index].result === "win")
                wins++;
        }
        return wins;
    }
    summary() {
        return this.lines.length + "전 " + this.count("win") + "승 " + this.count("draw") + "무 " + this.count("lose") + "패";
    }
    streakLabel() {
        const streak = this.streak();
        return streak > 0 ? "🔥 " + streak + "연승" : "연승 없음";
    }
    has(matchId) {
        return this.lines.some((line) => line.matchId === matchId);
    }
}
// 팀 대기실 만들기·들어가기. 코드는 일반 방 코드와 겹치지 않게 고른다.
class MkPartyDirectory {
    constructor(database, clock, paths, limit) {
        this.database = database;
        this.clock = clock;
        this.paths = paths;
        this.limit = limit;
    }
    async create(myId, member) {
        await this.sweep();
        for (let attempt = 0; attempt < MkPartyDirectory.CODE_ATTEMPTS; attempt++) {
            const code = String(10000 + Math.floor(Math.random() * 90000));
            const room = await this.database.ref(this.paths.rooms + "/" + code + "/status").once("value");
            if (room.exists())
                continue;
            const record = { leaderId: myId, createdAt: this.clock.now(), members: { [myId]: member }, bots: 0 };
            // 사람이 비어 있는 대기실도 건드리지 않는다. 잠깐 끊긴 학생이 곧 돌아올(MkParty.restore) 자리라,
            // 덮어쓰면 그 학생의 전적이 사라지고 다른 학생 전적과 섞인다.
            const result = await this.database.ref(this.paths.party(code)).transaction((current) => (current === null ? record : undefined));
            if (result.committed)
                return code;
        }
        return null;
    }
    // 이 기기가 쓰던 대기실로 돌아간다(MkPartyMemory). 다른 사람이 들어 있으면 실패 — 친구가 남아 있는 팀은 팀 코드로 다시 들어간다.
    // 새로고침하면 아이디가 바뀌고 예전 페이지 자리는 onDisconnect 가 지울 때까지 잠깐 남으므로, 이 기기의 직전 아이디(previousId) 자리는 내 것으로 본다.
    // (닉네임으로 보면 이름이 같은 친구를 밀어낼 수 있다.)
    // 전적(history)과 바로 전 상대(last)는 그대로 두고, 남아 있던 찾기·표는 지운다(지난 판 방으로 다시 들어가지 않게).
    async reclaim(code, myId, member, previousId = "") {
        let reclaimed = false;
        await this.database.ref(this.paths.party(code)).transaction((current) => {
            reclaimed = false;
            const record = current;
            if (record === null)
                return null;
            const members = record.members || {};
            if (!record.leaderId || Object.keys(members).some((id) => id !== myId && id !== previousId))
                return undefined;
            record.members = { [myId]: member };
            record.leaderId = myId;
            record.search = null;
            record.match = null;
            record.leftAt = null;
            reclaimed = true;
            return record;
        }).catch(() => undefined);
        return reclaimed;
    }
    async exists(code) {
        const snapshot = await this.database.ref(this.paths.party(code) + "/members").once("value");
        return snapshot.exists();
    }
    // transaction 은 처음에 기기 캐시(비어 있으면 null)로 한 번 돌기 때문에, null 일 때 그만두면(undefined)
    // 서버에 있는 팀을 못 찾는다. null 은 null 로 돌려줘서 서버 값으로 다시 돌게 하고, 실제로 넣었는지는 joined 로 본다.
    async join(code, myId, member) {
        let joined = false;
        let message = "그런 팀이 없어요. 코드를 확인해 주세요.";
        await this.database.ref(this.paths.party(code)).transaction((current) => {
            joined = false;
            message = "그런 팀이 없어요. 코드를 확인해 주세요.";
            const record = current;
            if (record === null)
                return null;
            if (!MkPartyDirectory.isAlive(record))
                return undefined;
            const members = record.members;
            if (members[myId]) {
                joined = true;
                return record;
            }
            if (record.search) {
                message = "이 팀은 지금 상대를 찾는 중이에요. 잠시 뒤에 다시 해 주세요.";
                return undefined;
            }
            const humans = Object.keys(members).length;
            if (humans >= this.limit) {
                message = "팀 자리가 가득 찼어요.";
                return undefined;
            }
            members[myId] = member;
            record.bots = Math.min(record.bots || 0, this.limit - humans - 1);
            joined = true;
            return record;
        });
        return joined ? { ok: true, message: "" } : { ok: false, message };
    }
    static isAlive(record) {
        return !!record && !!record.members && Object.keys(record.members).length > 0;
    }
    async sweep() {
        try {
            const snapshot = await this.database.ref(this.paths.parties).once("value");
            const all = snapshot.val() || {};
            const updates = {};
            const now = this.clock.now();
            Object.keys(all).forEach((code) => {
                const record = all[code];
                const lastActive = Math.max((record && record.createdAt) || 0, (record && record.leftAt) || 0);
                if (!MkPartyDirectory.isAlive(record) && !(now - lastActive < MkPartyDirectory.ABANDONED_MS))
                    updates[code] = null;
            });
            if (Object.keys(updates).length)
                await this.database.ref(this.paths.parties).update(updates);
        }
        catch (error) {
            return;
        }
    }
}
MkPartyDirectory.CODE_ATTEMPTS = 12;
// 사람이 없는 대기실은 대부분 연결이 잠깐 끊긴 것이라 곧 돌아온다(MkParty.restore). 오래된 것만 치운다.
MkPartyDirectory.ABANDONED_MS = 3 * 3600000;
// 팀 대기실 하나에 붙어 있는 동안의 상태. 판 중에도 연결을 유지해서 끝나면 같은 대기실로 돌아온다.
class MkParty {
    constructor(database, clock, paths, code, myId, limit) {
        this.database = database;
        this.clock = clock;
        this.paths = paths;
        this.code = code;
        this.myId = myId;
        this.limit = limit;
        this.record = null;
        this.onChange = () => undefined;
        this.onTicket = () => undefined;
        this.onClosed = () => undefined;
        this.handled = new Set();
        this.listener = null;
        this.leaving = false;
        this.handingOff = false;
        this.restoring = false;
        this.lastMe = null;
        this.ref = database.ref(paths.party(code));
    }
    connect() {
        this.ref.child("members/" + this.myId).onDisconnect().remove();
        this.listener = this.ref.on("value", (snapshot) => this.apply(snapshot.val()));
    }
    isLeader() {
        return !!this.record && this.record.leaderId === this.myId;
    }
    members() {
        const members = (this.record && this.record.members) || {};
        return Object.keys(members).map((id) => [id, members[id]]).sort((a, b) => a[1].joinedAt - b[1].joinedAt || (a[0] < b[0] ? -1 : 1));
    }
    bots() {
        return (this.record && this.record.bots) || 0;
    }
    size() {
        return this.members().length + this.bots();
    }
    searching() {
        return (this.record && this.record.search) || null;
    }
    searchSeconds() {
        const search = this.searching();
        return search ? Math.max(0, Math.floor((this.clock.now() - search.since) / 1000)) : 0;
    }
    ticket() {
        return (this.record && this.record.match) || null;
    }
    book() {
        return new MkRecordBook(this.record && this.record.history);
    }
    lastMatch() {
        return (this.record && this.record.last) || {};
    }
    setBots(count) {
        if (!this.isLeader() || this.searching())
            return;
        const allowed = Math.max(0, Math.min(count, this.limit - this.members().length));
        this.ref.child("bots").set(allowed);
    }
    updateMe(member) {
        if (this.record && this.record.members && this.record.members[this.myId])
            this.ref.child("members/" + this.myId).update({ nick: member.nick, look: member.look || null, rate: MkWinBand.clean(member.rate), recentMaps: MkRecentMaps.clean(member.recentMaps) });
    }
    markSearching(since) {
        return this.ref.child("search").set(since === null ? null : { since });
    }
    // 판 결과를 전적에 한 줄 쌓는다. 팀장만 쓰고, 같은 판 아이디는 한 번만 들어간다.
    async report(ticket, outcome) {
        if (!this.isLeader())
            return false;
        let added = false;
        const at = this.clock.now();
        await this.ref.child("history").transaction((current) => {
            added = false;
            const history = current || {};
            if (new MkRecordBook(history).has(ticket.matchId))
                return undefined;
            const line = { n: Object.keys(history).length + 1, matchId: ticket.matchId, at, result: outcome.result, rivals: outcome.rivals || ticket.rivals || [] };
            if (ticket.map)
                line.map = ticket.map;
            if (outcome.rank !== undefined)
                line.rank = outcome.rank;
            if (outcome.of !== undefined)
                line.of = outcome.of;
            history[MkParty.historyKey(ticket.matchId)] = line;
            added = true;
            return history;
        });
        const match = this.ticket();
        if (match && match.matchId === ticket.matchId)
            await this.ref.child("match").set(null);
        return added;
    }
    // 표를 받았는데 그 방에 못 들어갔을 때(방장이 사라짐 등) 팀장이 표를 지워 다시 매칭할 수 있게 한다.
    clearTicket(matchId) {
        const match = this.ticket();
        if (this.isLeader() && match && match.matchId === matchId)
            this.ref.child("match").set(null);
    }
    // keepRecord: 혼자 하는 게임에서 나갈 때 대기실(전적)을 지우지 않고 남겨 둔다. 다시 들어오면 reclaim 으로 이어 쓰고,
    // 안 오면 sweep 이 leftAt 기준으로 몇 시간 뒤에 치운다.
    async leave(keepRecord = false) {
        this.leaving = true;
        this.stopListening();
        try {
            this.ref.child("members/" + this.myId).onDisconnect().cancel();
        }
        catch (error) { /* 이미 끊긴 연결 */ }
        const wasLeader = this.isLeader();
        const at = this.clock.now();
        await this.ref.transaction((current) => {
            const record = current;
            if (!record || !record.members || !record.members[this.myId])
                return record === null ? null : undefined;
            delete record.members[this.myId];
            if (!Object.keys(record.members).length) {
                if (!keepRecord)
                    return null;
                record.search = null;
                record.match = null;
                record.leftAt = at;
                return record;
            }
            if (record.leaderId === this.myId) {
                record.leaderId = MkParty.firstMember(record.members);
                record.search = null;
            }
            return record;
        });
        if (wasLeader)
            await this.database.ref(this.paths.entry(this.code)).remove();
    }
    silentClose() {
        this.leaving = true;
        this.stopListening();
    }
    static historyKey(matchId) {
        return "m" + matchId.replace(/[^A-Za-z0-9_-]/g, "_");
    }
    static firstMember(members) {
        return Object.keys(members).sort((a, b) => members[a].joinedAt - members[b].joinedAt || (a < b ? -1 : 1))[0];
    }
    apply(record) {
        if (this.leaving || this.restoring)
            return;
        const mine = record && record.members ? record.members[this.myId] : undefined;
        if (!mine && record && this.lastMe) {
            this.restore(this.lastMe);
            return;
        }
        if (!MkPartyDirectory.isAlive(record) || !mine) {
            this.close();
            return;
        }
        this.lastMe = mine;
        this.record = record;
        this.handOffIfLeaderGone();
        this.onChange();
        const ticket = this.ticket();
        if (ticket && !this.handled.has(ticket.matchId) && !this.book().has(ticket.matchId)) {
            this.handled.add(ticket.matchId);
            this.onTicket(ticket);
        }
    }
    // 팀장이 끊기면 가장 먼저 들어온 사람이 팀장을 이어받는다. 연승(전적)은 대기실에 있으니 그대로 이어진다.
    handOffIfLeaderGone() {
        const record = this.record;
        const members = record.members;
        if (members[record.leaderId] || this.handingOff || MkParty.firstMember(members) !== this.myId)
            return;
        this.handingOff = true;
        this.ref.transaction((current) => {
            const latest = current;
            if (!MkPartyDirectory.isAlive(latest))
                return undefined;
            const party = latest;
            if (party.members[party.leaderId])
                return undefined;
            party.leaderId = MkParty.firstMember(party.members);
            party.search = null;
            return party;
        }).then(() => { this.handingOff = false; }, () => { this.handingOff = false; });
    }
    close() {
        this.record = null;
        this.lastMe = null;
        this.stopListening();
        this.onClosed("팀 대기실에서 나왔어요.");
    }
    // 태블릿이 잠깐 잠들거나 와이파이가 끊기면 서버의 onDisconnect 가 내 자리를 지운다.
    // 스스로 나간 게 아니고 대기실이 아직 남아 있으면 그 자리를 되살려 전적·연승을 지킨다.
    restore(me) {
        this.restoring = true;
        let back = false;
        this.ref.transaction((current) => {
            back = false;
            const record = current;
            if (!record || !record.leaderId)
                return undefined;
            const members = record.members || {};
            if (members[this.myId]) {
                back = true;
                return undefined;
            }
            if (Object.keys(members).length >= this.limit)
                return undefined;
            members[this.myId] = me;
            record.members = members;
            back = true;
            return record;
        }).then(() => back, () => false).then((ok) => {
            this.restoring = false;
            if (this.leaving)
                return;
            if (!ok) {
                this.close();
                return;
            }
            this.ref.child("members/" + this.myId).onDisconnect().remove();
            this.ref.once("value").then((snapshot) => this.apply(snapshot.val()), () => undefined);
        });
    }
    stopListening() {
        if (!this.listener)
            return;
        try {
            this.ref.off("value", this.listener);
        }
        catch (error) { /* 이미 끊긴 연결 */ }
        this.listener = null;
    }
}
// 팀장 기기에서만 돈다: 대기열 항목 올리기·내리기와, 내 차례면 묶어서 일반 방을 만들고 각 팀에 표를 나눠 주기.
class MkQueue {
    constructor(database, clock, paths, matcher, maker, random = Math.random) {
        this.database = database;
        this.clock = clock;
        this.paths = paths;
        this.matcher = matcher;
        this.maker = maker;
        this.random = random;
        this.entries = null;
        this.listener = null;
        this.timer = null;
        this.binding = false;
        this.restUntil = 0;
        this.active = false;
        this.cancelling = false;
        this.since = 0;
        this.onBound = () => undefined;
        this.onError = () => undefined;
        this.onEntries = () => undefined;
    }
    // me: 내 기기가 지금 아는 내 정보(승률처럼 팀 대기실 기록보다 새로울 수 있는 값)를 내 자리에 덮어쓴다.
    async enter(party, me = null) {
        const since = this.clock.now();
        this.since = since;
        const people = {};
        party.members().forEach(([id, member]) => {
            people[id] = { nick: member.nick, joinedAt: member.joinedAt, look: member.look || null };
            const rate = MkWinBand.clean(id === party.myId && me && me.rate !== undefined ? me.rate : member.rate);
            if (rate)
                people[id].rate = rate;
            const recentMaps = MkRecentMaps.clean(id === party.myId && me && me.recentMaps !== undefined ? me.recentMaps : member.recentMaps);
            if (recentMaps)
                people[id].recentMaps = recentMaps;
        });
        const last = party.lastMatch();
        const entry = { leader: party.myId, people, bots: party.bots(), size: party.size(), at: since, claim: null };
        if (last.rivals && last.rivals.length)
            entry.avoid = last.rivals.slice();
        if (last.ai)
            entry.owed = true;
        const ref = this.database.ref(this.paths.entry(party.code));
        ref.onDisconnect().remove();
        await ref.set(entry);
        await party.markSearching(since);
        this.watch(party);
    }
    // 내 항목을 실제로 뺐을 때만 true. 누가 묶어 가는 중(claim)이거나 이미 묶여 빠졌으면 false — 곧 표가 온다.
    async cancel(party) {
        const ref = this.database.ref(this.paths.entry(party.code));
        let removed = false;
        // 실제 Firebase 는 transaction 을 부르는 순간 내 기기 구독에 "항목 없음"을 먼저 보여 준다.
        // 그걸 "표 없이 사라짐"으로 오해해 복구 타이머를 걸면, 4초 안에 다시 매칭했을 때 새 '찾는 중'을 지워
        // 대기열에 항목이 남은 채 또 매칭하게 되고 표가 두 번 온다(24번 "방이 두 번 잡힘" 보고).
        this.cancelling = true;
        let result;
        try {
            result = await ref.transaction((current) => {
                removed = false;
                const entry = current;
                if (!entry)
                    return null;
                if (!this.matcher.isFree(entry, this.clock.now()))
                    return undefined;
                removed = true;
                return null;
            });
        }
        finally {
            this.cancelling = false;
        }
        if (!result.committed)
            return false;
        this.stop();
        try {
            ref.onDisconnect().cancel();
        }
        catch (error) { /* 이미 끊긴 연결 */ }
        if (removed)
            await party.markSearching(null);
        else
            this.recoverIfLost(party);
        return removed;
    }
    hasCompany(myCode) {
        return this.matcher.hasCompany(this.entries, this.clock.now(), myCode);
    }
    // 대기 화면의 "지금 n개 팀이 기다리는 중"(개인전은 n명 — 항목 하나가 한 사람). 이미 보고 있는 대기열 구독 값만 세므로 요청이 늘지 않는다.
    // 누가 묶어 가는 중(차지된) 항목은 곧 빠지므로 세지 않는다. 대기열을 아직 못 받았으면 null.
    othersWaiting(myCode) {
        if (!this.active || !this.entries)
            return null;
        const entries = this.entries, now = this.clock.now(), mine = entries[myCode];
        return Object.keys(entries)
            .filter((code) => code !== myCode && !!entries[code] && entries[code].size > 0 && this.matcher.isFree(entries[code], now) && (!mine || this.matcher.canMeet(mine, entries[code]))).length;
    }
    stop() {
        this.active = false;
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        if (this.listener) {
            try {
                this.database.ref(this.paths.queue).off("value", this.listener);
            }
            catch (error) { /* 이미 끊긴 연결 */ }
            this.listener = null;
        }
    }
    watch(party) {
        const myCode = party.code;
        this.stop();
        this.active = true;
        this.listener = this.database.ref(this.paths.queue).on("value", (snapshot) => {
            this.entries = snapshot.val();
            if (!this.entries || !this.entries[myCode]) {
                if (this.cancelling)
                    return;
                this.stop();
                this.recoverIfLost(party);
                this.onEntries();
                return;
            }
            this.consider(myCode);
            this.onEntries();
        });
    }
    // 내 항목이 표 없이 사라지면(묶던 사람이 표를 못 나눠 줌·연결 끊김) "찾는 중"에 갇히지 않게 잠시 뒤 풀어 준다.
    // 그 사이 다시 매칭을 눌렀으면(찾기 시작 시각이 다름) 새 매칭이므로 건드리지 않는다.
    recoverIfLost(party) {
        const since = this.since;
        setTimeout(() => {
            const search = party.searching();
            if (this.active || !search || search.since !== since || party.ticket())
                return;
            party.markSearching(null).catch(() => undefined);
            this.onError("매칭이 끊겼어요. 다시 매칭 시작을 눌러 주세요.");
        }, MkQueue.LOST_GRACE_MS);
    }
    consider(myCode) {
        if (!this.active)
            return;
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        const now = this.clock.now();
        if (this.binding)
            return;
        if (now < this.restUntil) {
            this.timer = setTimeout(() => this.consider(myCode), this.restUntil - now + 5);
            return;
        }
        if (this.matcher.anchor(this.entries, now) === myCode && this.matcher.plan(this.entries, now, this.random)) {
            this.bind(myCode);
            return;
        }
        const next = this.matcher.nextCheck(this.entries, now);
        if (next !== null)
            this.timer = setTimeout(() => this.consider(myCode), next - now + 5);
    }
    async bind(myCode) {
        this.binding = true;
        let plan = null;
        try {
            const result = await this.database.ref(this.paths.queue).transaction((current) => {
                plan = null;
                const entries = current;
                const now = this.clock.now();
                if (!entries || this.matcher.anchor(entries, now) !== myCode)
                    return undefined;
                plan = this.matcher.plan(entries, now, this.random);
                if (!plan)
                    return undefined;
                const claim = { by: myCode, at: now, id: plan.matchId };
                plan.groups.forEach((group) => { entries[group.code].claim = claim; });
                return entries;
            });
            const claimed = plan;
            if (result.committed && claimed && (await this.deliver(claimed))) {
                this.binding = false;
                this.consider(myCode);
                return;
            }
        }
        catch (error) {
            this.onError("매칭 중 연결이 끊겼어요. 다시 시도해 주세요.");
        }
        this.retryLater(myCode);
    }
    // 오래 기다려도 상대가 없을 때(aiFallbackMs): 내 항목만 차지해 우리 팀만 든 방을 만든다(상대 편은 게임이 AI 로 채움).
    // 그 사이 다른 팀장이 나를 묶어 가는 중(claim)이면 그만두고 사람끼리 매칭을 따른다.
    async goSolo(myCode) {
        if (this.binding)
            return false;
        this.binding = true;
        let plan = null;
        let delivered = false;
        try {
            const result = await this.database.ref(this.paths.queue).transaction((current) => {
                plan = null;
                const entries = current;
                const now = this.clock.now();
                const mine = entries ? entries[myCode] : null;
                if (!entries || !mine || !this.matcher.isFree(mine, now))
                    return undefined;
                const solo = {
                    matchId: myCode + "-ai-" + now.toString(36),
                    seed: Math.floor(this.random() * 2147483647),
                    binder: myCode,
                    groups: [{ code: myCode, entry: mine, side: this.random() < 0.5 ? 0 : 1 }]
                };
                mine.claim = { by: myCode, at: now, id: solo.matchId };
                plan = solo;
                return entries;
            });
            const claimed = plan;
            delivered = result.committed && !!claimed && (await this.deliver(claimed));
        }
        catch (error) {
            delivered = false;
        }
        this.binding = false;
        if (!delivered)
            this.consider(myCode);
        return delivered;
    }
    // 묶기가 그만둬졌다는 건 내 기기가 본 대기열이 서버보다 늦다는 뜻이다. 바로 다시 하면
    // 같은 판단을 끝없이 되풀이하므로, 잠깐 쉬었다가(그 사이 새 대기열 값이 오면 그걸로) 다시 본다.
    retryLater(myCode) {
        this.binding = false;
        this.restUntil = this.clock.now() + MkQueue.RETRY_MS;
        this.consider(myCode);
    }
    // 방을 만드는 사이 차지가 만료돼 다른 사람이 가져갔거나 취소됐을 수 있다. 그래서 표를 나눠 주기 전에
    // 내 차지가 그대로인 항목만 transaction 으로 대기열에서 한꺼번에 빼고, 하나라도 빠졌으면 방을 버리고 다시 한다.
    async deliver(plan) {
        const made = await this.maker.create(plan).catch(() => null);
        if (!made) {
            await this.release(plan);
            return false;
        }
        let confirmed = false;
        const sealed = await this.database.ref(this.paths.queue).transaction((current) => {
            confirmed = false;
            const entries = current;
            if (!entries)
                return undefined;
            const held = plan.groups.every((group) => {
                const entry = entries[group.code];
                return !!entry && !!entry.claim && entry.claim.id === plan.matchId;
            });
            if (!held)
                return undefined;
            plan.groups.forEach((group) => { delete entries[group.code]; });
            confirmed = true;
            return entries;
        }).catch(() => null);
        if (!sealed || !sealed.committed || !confirmed) {
            if (this.maker.discard)
                await this.maker.discard(made).catch(() => undefined);
            await this.release(plan);
            return false;
        }
        const at = this.clock.now();
        const expect = plan.groups.reduce((sum, group) => sum + Object.keys(group.entry.people || {}).length, 0);
        const updates = {};
        plan.groups.forEach((group) => {
            const rivals = [], rivalIds = {};
            plan.groups.forEach((other) => {
                if (other !== group)
                    Object.keys(other.entry.people || {}).forEach((id) => { rivals.push(other.entry.people[id].nick); rivalIds[id] = other.entry.people[id].nick; });
            });
            const ticket = { matchId: plan.matchId, room: made.room, side: group.side, host: made.host, expect, at, rivals };
            if (rivals.length)
                ticket.rivalIds = rivalIds;
            if (made.map)
                ticket.map = made.map;
            updates[this.paths.party(group.code) + "/match"] = ticket;
            updates[this.paths.party(group.code) + "/search"] = null;
            updates[this.paths.party(group.code) + "/last"] = { rivals: plan.groups.filter((other) => other !== group).map((other) => other.code), ai: plan.groups.length === 1 };
        });
        // 실제 Firebase 는 ref("") 를 잘못된 경로로 거절한다. 루트는 "/" 로 연다.
        try {
            await this.database.ref("/").update(updates);
        }
        catch (error) {
            if (this.maker.discard)
                await this.maker.discard(made).catch(() => undefined);
            this.onError("상대에게 경기장을 알리지 못했어요. 다시 매칭해 주세요.");
            return true;
        }
        this.onBound(plan);
        return true;
    }
    async release(plan) {
        await this.database.ref(this.paths.queue).transaction((current) => {
            const entries = current;
            if (!entries)
                return undefined;
            plan.groups.forEach((group) => {
                const entry = entries[group.code];
                if (entry && entry.claim && entry.claim.id === plan.matchId)
                    entry.claim = null;
            });
            return entries;
        });
    }
}
MkQueue.RETRY_MS = 250;
MkQueue.LOST_GRACE_MS = 4000;
// 경기 중인 팀이 대기열 자기 자리에 세워 두는 표지판(size 0, busyUntil). 다른 팀이 "방금 붙은 상대와 또 붙을지,
// 곧 돌아올 팀을 잠깐 기다릴지" 판단하는 데 쓴다. 팀장 기기만 세우고, 끊기면 onDisconnect 로 사라지며,
// 시간이 지나면 스스로 무시된다. 진짜 대기 항목(매칭 시작)이 이미 있으면 덮어쓰지 않는다.
class MkBusySign {
    constructor(database, clock, paths) {
        this.database = database;
        this.clock = clock;
        this.paths = paths;
    }
    // owed: AI 와 하는 판이면 true. 돌아오는 이 팀이 또 혼자 남지 않게 다른 팀이 잠깐 기다려 준다.
    async put(party, forMs, owed) {
        if (!party.isLeader())
            return;
        const ref = this.database.ref(this.paths.entry(party.code));
        const now = this.clock.now();
        const sign = { leader: party.myId, people: {}, bots: 0, size: 0, at: now, claim: null, busyUntil: now + forMs };
        if (owed)
            sign.owed = true;
        try {
            ref.onDisconnect().remove();
            await ref.transaction((current) => {
                const entry = current;
                if (entry && entry.size > 0)
                    return undefined;
                return sign;
            });
        }
        catch (error) { /* 표지판은 없어도 매칭은 된다 */ }
    }
}
// 편(side)마다 자리 번호를 정해 준다. 일반 방에 assign/<id> 로 넣어 두면 들어오는 사람이 그 자리에 앉는다.
class MkSeatAssign {
    static bySide(plan, perSide) {
        const assign = {};
        plan.groups.forEach((group) => {
            MkSeatAssign.peopleOf(group).slice(0, perSide).forEach((id, index) => { assign[id] = group.side * perSide + index; });
        });
        return assign;
    }
    static peopleOf(group) {
        const people = group.entry.people || {};
        return Object.keys(people).sort((a, b) => people[a].joinedAt - people[b].joinedAt || (a < b ? -1 : 1));
    }
    static sideOf(plan, id) {
        const group = plan.groups.find((item) => !!(item.entry.people || {})[id]);
        return group ? group.side : -1;
    }
}
class MkPartyPanel {
    constructor(screen, mount, options) {
        this.options = options;
        this.onMatch = () => undefined;
        this.onLeave = () => undefined;
        this.onAddBot = () => undefined;
        this.onRemoveBot = () => undefined;
        this.onAiNow = () => undefined;
        this.streakCount = 0;
        const openStats = () => { if (options.stats)
            options.stats.open(); };
        this.streak = new MkStreakBadge();
        this.statsButton = MkPartyPanel.button("mk-stats", "📊 내 통계 · 최근 20매치", openStats);
        this.statsButton.hidden = !options.stats || !!(options.headExtra && options.headExtra.querySelector("[data-account-open]"));
        this.head = document.createElement("h2");
        this.head.className = "mk-head";
        this.code = document.createElement("span");
        this.code.className = "mk-code";
        if (options.solo)
            this.head.append("랜덤 매칭 ", this.streak.element, this.statsButton);
        else
            this.head.append("팀 코드 ", this.code, this.streak.element, this.statsButton);
        this.seats = document.createElement("div");
        this.seats.className = "mk-team";
        this.seats.addEventListener("click", (event) => {
            const seat = event.target.closest("[data-mk-seat]");
            if (!seat || seat.disabled)
                return;
            if (seat.dataset.mkSeat === "bot")
                this.onRemoveBot();
            if (seat.dataset.mkSeat === "empty")
                this.onAddBot();
        });
        this.notice = document.createElement("div");
        this.notice.className = "mk-notice";
        this.crowd = document.createElement("div");
        this.crowd.className = "mk-crowd";
        this.matchButton = MkPartyPanel.button("st-btn primary mk-match", "매칭 시작", () => this.onMatch());
        this.aiNowButton = MkPartyPanel.button("st-btn primary mk-ai-now", "🤖 AI와 바로 시작", () => this.onAiNow());
        this.aiNowButton.hidden = true;
        this.hint = document.createElement("div");
        this.hint.className = "st-hint mk-hint";
        // 30번 대기실처럼 나가기는 카드 오른쪽 위 작은 빨간 버튼(2026-10-27 선생님 요청, 모든 랜덤 매칭 대기실 공통).
        const leave = MkPartyPanel.button("mk-leave", options.solo ? "나가기" : "팀 나가기", () => this.onLeave());
        mount.textContent = "";
        mount.classList.add("mk-panel");
        const top = document.createElement("div");
        top.className = "mk-top";
        top.append(this.head);
        if (options.headExtra)
            top.append(options.headExtra);
        const buttons = document.createElement("div");
        buttons.className = "st-row mk-buttons";
        buttons.append(this.aiNowButton, this.matchButton);
        mount.append(leave, top, this.seats, this.notice, this.crowd, buttons, this.hint);
    }
    setNotice(text) {
        if (this.notice.textContent !== text)
            this.notice.textContent = text;
    }
    setStreak(count) {
        this.streakCount = count;
        this.streak.render(count);
    }
    streakNote() {
        return this.streakCount > 0 ? " · 지금 " + this.streakCount + "연승 중" : "";
    }
    setBusy(busy) {
        this.matchButton.disabled = busy;
        this.aiNowButton.disabled = busy;
    }
    // waitingForOthers: 대기열에 상대가 있는데 바로 전 판 상대라, 경기 중인 다른 팀이 돌아오길 잠깐 기다리는 중.
    // waiting: 대기열에서 나 말고 기다리는 학생 수(찾는 중이 아니거나 아직 모르면 null).
    render(party, waitingForOthers = false, waiting = null) {
        const leader = party.isLeader();
        const searching = !!party.searching();
        this.code.textContent = party.code;
        this.streak.render(this.streakCount);
        this.seats.textContent = "";
        if (!this.options.solo) {
            const title = document.createElement("h3");
            title.textContent = "우리 팀";
            this.seats.appendChild(title);
        }
        const leaderId = party.record ? party.record.leaderId : "";
        party.members().forEach(([id, member]) => {
            const tags = id === leaderId && !this.options.solo ? "팀장" : "";
            this.seats.appendChild(MkPartyPanel.seat("div", "mk-seat" + (id === party.myId ? " me" : ""), member.nick, tags, ""));
        });
        const editable = leader && !searching;
        if (this.options.allowBots) {
            for (let index = 0; index < party.bots(); index++) {
                const seat = MkPartyPanel.seat("button", "mk-seat bot", "🤖 AI", editable ? "눌러서 빼기" : "", "bot");
                seat.disabled = !editable;
                this.seats.appendChild(seat);
            }
        }
        for (let count = party.members().length + (this.options.allowBots ? party.bots() : 0); count < this.options.partyLimit; count++) {
            if (this.options.allowBots && editable)
                this.seats.appendChild(MkPartyPanel.seat("button", "mk-seat empty", "🤖 AI 추가", "", "empty"));
            else
                this.seats.appendChild(MkPartyPanel.seat("div", "mk-seat empty", "빈 자리", "", ""));
        }
        this.matchButton.textContent = searching ? "매칭 취소" : "매칭 시작";
        this.matchButton.classList.toggle("primary", !searching);
        this.matchButton.classList.toggle("cancel", searching);
        this.matchButton.disabled = !leader;
        this.aiNowButton.hidden = !this.options.aiFallbackMs || !searching || !leader;
        this.aiNowButton.disabled = false;
        const unit = this.options.solo ? { some: "명이", none: "학생이" } : { some: "개 팀이", none: "팀이" };
        const crowdText = !searching || waiting === null ? "" : waiting > 0 ? "👥 지금 " + waiting + unit.some + " 기다리는 중" : "👥 지금 기다리는 " + unit.none + " 없어요";
        if (this.crowd.textContent !== crowdText)
            this.crowd.textContent = crowdText;
        this.crowd.classList.toggle("alone", searching && waiting === 0);
        const streakNote = this.streakNote();
        const fallback = this.options.aiFallbackMs ? Math.ceil(this.options.aiFallbackMs / 1000) - party.searchSeconds() : 0;
        const fallbackNote = waitingForOthers ? " · 다른 팀 경기가 끝나길 기다리는 중(같은 상대와 연달아 만나지 않게)"
            : !this.options.aiFallbackMs ? "" : fallback > 0 ? " · " + fallback + "초 뒤 AI와 시작해요" : " · AI와 시작하는 중…";
        const hint = searching ? "상대를 찾는 중… " + party.searchSeconds() + "초" + fallbackNote + streakNote : leader ? "" : "팀장이 매칭을 시작하길 기다리는 중이에요…";
        if (this.hint.textContent !== hint)
            this.hint.textContent = hint;
    }
    static button(className, text, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = text;
        button.addEventListener("click", () => { button.blur(); onClick(); });
        return button;
    }
    static seat(tag, className, name, note, kind) {
        const seat = document.createElement(tag);
        seat.className = className;
        if (tag === "button")
            seat.type = "button";
        if (kind)
            seat.dataset.mkSeat = kind;
        const bold = document.createElement("b");
        bold.textContent = name;
        const small = document.createElement("small");
        small.textContent = note;
        seat.append(bold, small);
        return seat;
    }
}
class MkRandomFlow {
    constructor(database, clock, myId, options, hooks, panel) {
        this.database = database;
        this.clock = clock;
        this.myId = myId;
        this.options = options;
        this.hooks = hooks;
        this.panel = panel;
        this.party = null;
        this.queue = null;
        this.current = null;
        this.startTimer = null;
        this.secondsTimer = null;
        this.startedFor = "";
        this.reported = false;
        this.fallbackFor = 0;
        this.streakArmedFor = "";
        this.statsArmedFor = "";
        this.seenRivals = new Set();
        this.paths = MkPaths.forGame(options.gameRoot, options.queue);
        this.directory = new MkPartyDirectory(database, clock, this.paths, options.partyLimit);
        this.memory = new MkPartyMemory(options.queue);
        this.sign = new MkBusySign(database, clock, this.paths);
        this.streak = new MkPersonalStreak(options.gameRoot);
        panel.onMatch = () => this.toggleSearch();
        panel.onLeave = () => this.leaveParty();
        panel.onAddBot = () => { if (this.party)
            this.party.setBots(this.party.bots() + 1); };
        panel.onRemoveBot = () => { if (this.party)
            this.party.setBots(this.party.bots() - 1); };
        panel.onAiNow = () => this.startWithAiNow();
    }
    inParty() {
        return !!this.party;
    }
    ticket() {
        return this.current;
    }
    // 여럿이 한 방에 모이는 게임에서 "우리 팀 누군가 1등"을 판단할 때 쓴다.
    memberIds() {
        return this.party ? this.party.members().map(([id]) => id) : [];
    }
    hasTicket() {
        return !!this.current;
    }
    async create() {
        const member = this.hooks.member();
        const kept = this.memory.recall(member.nick);
        if (kept && (await this.directory.reclaim(kept.code, this.myId, member, kept.id))) {
            this.memory.remember(kept.code, member.nick, this.myId);
            this.attach(kept.code);
            return "";
        }
        const code = await this.directory.create(this.myId, member);
        if (!code)
            return "랜덤 매칭 방을 만들지 못했어요. 다시 눌러 주세요.";
        this.memory.remember(code, member.nick, this.myId);
        this.attach(code);
        return "";
    }
    async tryJoin(code) {
        if (this.options.solo || !(await this.directory.exists(code)))
            return { handled: false, message: "" };
        const outcome = await this.directory.join(code, this.myId, this.hooks.member());
        if (outcome.ok)
            this.attach(code);
        return { handled: true, message: outcome.message };
    }
    async codeTaken(code) {
        return this.directory.exists(code);
    }
    updateMe() {
        if (this.party)
            this.party.updateMe(this.hooks.member());
    }
    render() {
        if (!this.party)
            return;
        const searching = !!this.queue && !!this.party.searching();
        this.panel.render(this.party, searching && this.queue.hasCompany(this.party.code), this.queue ? this.queue.othersWaiting(this.party.code) : null);
    }
    setNotice(text) {
        this.panel.setNotice(text);
    }
    // 방장 기기에서 일반 방 사람 수가 바뀔 때마다 부른다. 표에 적힌 사람이 다 모이면 바로 시작한다.
    roomChanged(humans, hosting, inLobby) {
        this.notePresentRivals();
        this.armMatch();
        if (this.current && hosting && inLobby && humans >= this.current.expect)
            this.startNow();
    }
    // 경기장에 들어온 판은 결과가 나기 전에 사라져도(← 목록으로·탭 닫기) 패배로 남게 미리 적어 둔다.
    // 경기 화면을 따로 알리는 게임은 판이 시작될 때 이것도 부른다(같은 판은 한 번만 적힌다).
    armMatch() {
        const ticket = this.current;
        if (!ticket || !this.party || this.reported)
            return;
        if (this.streakArmedFor !== ticket.matchId) {
            this.streakArmedFor = ticket.matchId;
            this.streak.arm(ticket.matchId);
        }
        const guard = this.guard();
        if (guard && this.statsArmedFor !== ticket.matchId && guard.arm(ticket))
            this.statsArmedFor = ticket.matchId;
    }
    disarmMatch(ticket) {
        if (this.streakArmedFor === ticket.matchId)
            this.streak.disarm(ticket.matchId);
        const guard = this.guard();
        if (guard && this.statsArmedFor === ticket.matchId)
            guard.disarm(ticket);
        this.streakArmedFor = this.statsArmedFor = "";
    }
    guard() {
        return (this.options.stats && this.options.stats.guard) || null;
    }
    // 매칭된 상대가 끝내 경기장에 안 들어오면 게임이 그 자리를 AI 로 채운다. 그 판 전적에 그 학생 이름이 남지 않게,
    // 방에 한 번이라도 들어온 상대만 모아 둔다(경기 중에 나간 상대는 함께 한 것으로 본다).
    notePresentRivals() {
        const ticket = this.current;
        if (!ticket || !ticket.rivalIds || !this.hooks.presentIds)
            return;
        const rivalIds = ticket.rivalIds;
        this.hooks.presentIds().forEach((id) => { if (rivalIds[id] !== undefined)
            this.seenRivals.add(id); });
    }
    actualRivals(ticket) {
        if (!ticket.rivalIds || !this.hooks.presentIds)
            return undefined;
        this.notePresentRivals();
        const rivalIds = ticket.rivalIds;
        return Object.keys(rivalIds).filter((id) => this.seenRivals.has(id)).map((id) => rivalIds[id]);
    }
    // 판이 끝났을 때 팀원 모두가 부른다. 연승은 각자 자기 계정에 남긴다(같은 판은 한 번만).
    // 화면의 연승은 2026-10-27 선생님 결정으로 팀 대기실 전적이 아니라 아이디 단위다. 팀 대기실 전적(MkParty.report, 팀장만)은
    // 화면에 보이지 않지만 "이미 끝난 판의 표로 다시 들어가지 않기"(MkParty 의 book().has)에 쓰여서 그대로 남긴다.
    matchEnded(outcome, onStreak = () => undefined) {
        const ticket = this.current;
        if (!ticket || !this.party || this.reported)
            return;
        this.reported = true;
        const rivals = outcome.rivals || this.actualRivals(ticket);
        const final = rivals ? { ...outcome, rivals } : outcome;
        this.party.report(ticket, final);
        if (this.options.stats && this.options.stats.recordOutcome)
            this.options.stats.recordOutcome(ticket, final);
        // 진 판이 아니면 미리 적은 패배를 치운다. 게임이 결과를 계정에 남기지 못하고 화면을 떠나도 거짓 패배가 되지 않게.
        const guard = this.guard();
        if (guard && final.result !== "lose" && this.statsArmedFor === ticket.matchId)
            guard.disarm(ticket);
        this.streak.apply(ticket.matchId, final.result).then(() => {
            this.panel.setStreak(this.streak.current());
            onStreak();
        });
    }
    // 랜덤 매칭 판에서는 경기 중 언제 나가도 나간 쪽은 패(2026-10-27 선생님 요청, 예전에는 절반 뒤에만).
    // progress 는 예전 호출 모양을 지키려고 받기만 한다. 판이 이미 끝나 결과를 기록했으면 해당 없음.
    forfeitApplies(progress = 0) {
        return !!this.current && !!this.party && !this.reported && progress >= 0;
    }
    forfeitIfLate(progress = 0) {
        if (!this.forfeitApplies(progress))
            return false;
        this.matchEnded({ result: "lose" });
        return true;
    }
    endHint() {
        return this.party ? "지금 " + this.streak.label().replace("🔥 ", "") : "";
    }
    backToParty(message) {
        const note = this.reported ? "" : message;
        this.clearStartTimer();
        if (this.current && !this.reported)
            this.disarmMatch(this.current);
        if (this.current && this.party)
            this.party.clearTicket(this.current.matchId);
        this.current = null;
        this.reported = false;
        this.hooks.leaveRoom();
        if (this.party) {
            if (!this.party.searching())
                this.sign.put(this.party, this.options.matcher.returnGraceMs, !!this.party.lastMatch().ai);
            this.hooks.showParty();
            this.panel.setNotice(note);
            this.render();
        }
        else
            this.hooks.showStart(note);
    }
    attach(code) {
        const party = new MkParty(this.database, this.clock, this.paths, code, this.myId, this.options.partyLimit);
        this.party = party;
        party.onChange = () => {
            this.render();
            this.tickSeconds(!!party.searching());
        };
        party.onTicket = (ticket) => this.receiveTicket(ticket);
        party.onClosed = (message) => this.dropParty(message);
        party.connect();
        this.panel.setNotice("");
        this.panel.setStreak(this.streak.current());
        this.streak.load().then(() => { this.panel.setStreak(this.streak.current()); this.render(); });
        const guard = this.guard();
        if (guard)
            guard.settle();
        this.hooks.showParty();
    }
    async toggleSearch() {
        const party = this.party;
        if (!party || !party.isLeader())
            return;
        this.panel.setBusy(true);
        try {
            if (party.searching()) {
                const cancelled = this.queue ? await this.queue.cancel(party) : (await party.markSearching(null), true);
                if (!cancelled)
                    this.panel.setNotice("상대를 찾았어요! 곧 경기장으로 가요.");
            }
            else {
                this.panel.setNotice("");
                if (this.queue)
                    this.queue.stop();
                this.queue = new MkQueue(this.database, this.clock, this.paths, this.options.matcher, this.hooks);
                this.queue.onError = (message) => this.panel.setNotice(message);
                this.queue.onEntries = () => this.render();
                await this.queue.enter(party, this.hooks.member());
            }
        }
        catch (error) {
            this.panel.setNotice("매칭 서버에 연결하지 못했어요. (인터넷·데이터베이스 규칙 확인)");
        }
        this.render();
    }
    async receiveTicket(ticket) {
        if (this.queue)
            this.queue.stop();
        this.tickSeconds(false);
        this.hooks.leaveRoom();
        this.current = ticket;
        this.reported = false;
        this.seenRivals.clear();
        if (this.party)
            this.sign.put(this.party, this.options.matcher.busyMs, !(ticket.rivals || []).length);
        const hosting = ticket.host === this.myId;
        const entered = await this.hooks.enterRoom(ticket, hosting).catch(() => false);
        if (!entered) {
            this.current = null;
            if (this.party)
                this.party.clearTicket(ticket.matchId);
            this.hooks.showParty();
            this.panel.setNotice("경기장에 들어가지 못했어요. 다시 매칭해 주세요.");
            return;
        }
        this.armMatch();
        if (hosting) {
            this.clearStartTimer();
            this.startTimer = setTimeout(() => this.startNow(), this.options.startWaitMs || MkRandomFlow.START_WAIT_MS);
        }
    }
    startNow() {
        this.clearStartTimer();
        if (!this.current || this.startedFor === this.current.matchId)
            return;
        this.startedFor = this.current.matchId;
        this.hooks.startMatch();
    }
    clearStartTimer() {
        if (this.startTimer)
            clearTimeout(this.startTimer);
        this.startTimer = null;
    }
    tickSeconds(on) {
        if (on && !this.secondsTimer)
            this.secondsTimer = setInterval(() => { this.render(); this.checkAiFallback(); }, 1000);
        if (!on && this.secondsTimer) {
            clearInterval(this.secondsTimer);
            this.secondsTimer = null;
        }
    }
    checkAiFallback() {
        const party = this.party, wait = this.options.aiFallbackMs;
        const search = party ? party.searching() : null;
        if (!wait || !party || !search || !party.isLeader() || !this.queue || this.fallbackFor === search.since)
            return;
        const waited = this.clock.now() - search.since;
        if (waited < wait)
            return;
        if (this.queue.hasCompany(party.code) && waited < wait + this.options.matcher.rematchWaitMs + MkRandomFlow.COMPANY_GRACE_MS)
            return;
        this.fallbackFor = search.since;
        this.queue.goSolo(party.code);
    }
    // 기다리기 싫으면 aiFallbackMs 를 기다리지 않고 바로 AI 대전. 그 사이 사람과 묶이는 중이면 사람 매칭을 따른다.
    async startWithAiNow() {
        const party = this.party;
        const search = party ? party.searching() : null;
        if (!party || !search || !party.isLeader() || !this.queue)
            return;
        this.fallbackFor = search.since;
        this.panel.setBusy(true);
        const started = await this.queue.goSolo(party.code).catch(() => false);
        if (!started && !party.ticket())
            this.panel.setNotice("다른 학생과 연결되는 중이에요. 잠시만 기다려 주세요.");
        this.render();
    }
    async leaveParty() {
        const party = this.party;
        if (!party)
            return;
        if (this.queue)
            this.queue.stop();
        this.tickSeconds(false);
        this.party = null;
        await party.leave(true).catch(() => undefined);
        this.hooks.showStart("");
    }
    dropParty(message) {
        if (this.queue)
            this.queue.stop();
        this.tickSeconds(false);
        this.party = null;
        if (!this.current)
            this.hooks.showStart(message);
    }
}
MkRandomFlow.START_WAIT_MS = 15000;
// 사람 상대가 대기열에 있어 AI 대체를 미뤄도, 묶는 팀장 기기가 잠들어 묶지 못할 수 있으니 이만큼 더 지나면 AI 와 시작한다.
MkRandomFlow.COMPANY_GRACE_MS = 15000;
// 새로고침·나가기를 해도 같은 대기실(전적·연승·바로 전 상대)을 이어 쓰게 이 기기에 대기실 코드와 내 아이디를 적어 둔다
// (24번에서 먼저 쓰다가 2026-10-22 모든 게임으로 넓힘). 같은 태블릿을 다른 학생이 쓸 수 있으니 닉네임이 같을 때만 돌아가고,
// 오래 안 쓴 대기실은 서버에서 치워지므로(MkPartyDirectory.sweep) 다음 날까지 이어지지는 않는다.
// 랜덤 매칭 중간 이탈 규칙(24번에서 먼저 쓰다가 2026-10-22 모든 게임으로). 확인 문구를 게임마다 같게 쓴다.
class MkForfeit {
    static clamp(progress) {
        return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    }
}
MkForfeit.AT = 0.5;
MkForfeit.QUESTION = "지금 나가면 패배로 기록됩니다. 나갈까요?";
MkForfeit.TAP_AGAIN = "한 번 더 누르면 패배로 나가요";
class MkPartyMemory {
    constructor(queueName) {
        this.key = "mk_party_" + queueName + "_v1";
        this.oldKey = "mk_solo_party_" + queueName + "_v1";
    }
    recall(nick) {
        const saved = this.read(this.key) || this.read(this.oldKey);
        return saved && saved.code && saved.nick === nick ? { code: saved.code, id: saved.id || "" } : null;
    }
    remember(code, nick, id) {
        try {
            localStorage.setItem(this.key, JSON.stringify({ code, nick, id }));
        }
        catch (error) { /* 저장 못 하는 기기 */ }
    }
    read(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || "null");
        }
        catch (error) {
            return null;
        }
    }
}
// 연승 표시 버튼(🔥 n연승 / 연승 없음). 누르면 게임의 계정 통계 창을 연다.
// 내 계정의 랜덤 매칭 연승(MkPersonalStreak, 팀 대기실 전적이 아님)을 보여 주기만 한다. 누르는 기능은 없앴다(2026-10-27 선생님 요청).
class MkStreakBadge {
    constructor() {
        this.element = document.createElement("span");
        this.element.className = "mk-streak";
        this.render(0);
    }
    render(count) {
        const label = MkStreakMath.label(count);
        if (this.element.textContent !== label)
            this.element.textContent = label;
        this.element.classList.toggle("hot", count > 0);
    }
}
// 연승 계산(화면·통신 없음, tools/match-sim.js 가 검사). 이기면 +1, 지면 0, 비기면 그대로. 상한 없음(2026-10-27 선생님 요청).
class MkStreakMath {
    static normalize(raw) {
        const value = (raw && typeof raw === "object" ? raw : {});
        const n = MkStreakMath.count(value.n);
        const record = { n, b: Math.max(n, MkStreakMath.count(value.b)), id: typeof value.id === "string" ? value.id : "" };
        if (typeof value.p === "string" && value.p && value.p !== record.id)
            record.p = value.p;
        return record;
    }
    // 결과 없이 사라진 판(p)을 진 것으로 정리한다. 남은 판이 없으면 그대로.
    static settle(before) {
        return before.p ? { n: 0, b: before.b, id: before.p } : { n: before.n, b: before.b, id: before.id };
    }
    static arm(before, matchId) {
        const id = MkStreakMath.key(matchId);
        if (!id || before.id === id || before.p === id)
            return null;
        return { ...MkStreakMath.settle(before), p: id };
    }
    static disarm(before, matchId) {
        const id = MkStreakMath.key(matchId);
        return id && before.p === id ? { n: before.n, b: before.b, id: before.id } : null;
    }
    static next(before, matchId, result) {
        const id = MkStreakMath.key(matchId);
        if (!id || before.id === id)
            return null;
        const base = before.p === id ? MkStreakMath.disarm(before, matchId) : MkStreakMath.settle(before);
        if (base.id === id)
            return null;
        const n = result === "win" ? base.n + 1 : result === "lose" ? 0 : base.n;
        return { n, b: Math.max(base.b, n), id };
    }
    static key(matchId) {
        return String(matchId || "").replace(/[.#$\[\]\/\s]/g, "_").slice(0, MkStreakMath.KEY_MAX);
    }
    static label(count) {
        return count > 0 ? "🔥 " + count + "연승" : "연승 없음";
    }
    static count(value) {
        const number = Number(value);
        return isFinite(number) && number > 0 ? Math.floor(number) : 0;
    }
}
MkStreakMath.EMPTY = { n: 0, b: 0, id: "" };
MkStreakMath.KEY_MAX = 60;
// 연승은 팀 대기실이 아니라 아이디(로그인 계정)마다 센다(2026-10-27 선생님 요청).
// 로그인했으면 users/<uid>/streak/<게임 루트> = {n 지금 연승, b 최고 연승, id 마지막 판}, 로그인 전(배포용 링크)은 이 기기 localStorage.
// 요청: 대기실에 들어갈 때 읽기 1번, 판을 시작할 때 미리 패배 적기 1번, 판이 끝날 때 쓰기 1번(자기 계정에만). 폴링 없음.
class MkPersonalStreak {
    constructor(game) {
        this.game = game;
        this.value = MkStreakMath.EMPTY;
        this.pending = Promise.resolve();
    }
    current() {
        return this.value.n;
    }
    label() {
        return MkStreakMath.label(this.value.n);
    }
    // 읽었을 때 결과 없는 판이 남아 있으면 그 판은 이 화면에서 진행 중이 아니니(새로 연 화면) 패배로 정산해 둔다.
    load() {
        this.pending = this.pending.then(() => this.read()).then((raw) => {
            const stored = MkStreakMath.normalize(raw);
            this.value = MkStreakMath.settle(stored);
            return stored.p ? this.save(this.value).catch(() => undefined) : undefined;
        }, () => undefined);
        return this.pending;
    }
    arm(matchId) {
        return this.change((before) => MkStreakMath.arm(before, matchId));
    }
    disarm(matchId) {
        return this.change((before) => MkStreakMath.disarm(before, matchId));
    }
    apply(matchId, result) {
        return this.change((before) => MkStreakMath.next(before, matchId, result));
    }
    change(step) {
        this.pending = this.pending.then(() => {
            const next = step(this.value);
            if (!next)
                return undefined;
            this.value = next;
            return this.save(next).catch(() => undefined);
        });
        return this.pending;
    }
    account() {
        if (typeof window === "undefined" || !window.PORTAL_USER || typeof AccountDatabase !== "function")
            return null;
        return new AccountDatabase(window.PORTAL_USER);
    }
    path() {
        return "streak/" + this.game;
    }
    localKey() {
        return "mk_streak_" + this.game + "_v1";
    }
    read() {
        const database = this.account();
        if (database)
            return database.read(this.path());
        try {
            return Promise.resolve(typeof localStorage === "undefined" ? null : JSON.parse(localStorage.getItem(this.localKey()) || "null"));
        }
        catch (error) {
            return Promise.resolve(null);
        }
    }
    save(record) {
        const database = this.account();
        if (database)
            return database.write(this.path(), record);
        try {
            if (typeof localStorage !== "undefined")
                localStorage.setItem(this.localKey(), JSON.stringify(record));
        }
        catch (error) { /* 저장 못 하는 기기 */ }
        return Promise.resolve();
    }
}
