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
// 연승 버튼·전적 창(MkStreakButton·MkHistoryDialog)으로 나뉜다. 모양은 theme.css 의 .mk-* .
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
class MkMatcher {
    constructor(partyLimit, timing = MkMatcher.TIMING) {
        this.partyLimit = partyLimit;
        this.timing = timing;
    }
    anchor(entries, now) {
        const ready = this.ready(entries, now);
        return ready.length ? ready[0][0] : null;
    }
    plan(entries, now, random) {
        const ready = this.ready(entries, now);
        if (!ready.length)
            return null;
        const picked = this.pick(ready);
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
            const moments = [entry.at + this.timing.settleMs];
            if (entry.claim)
                moments.push(entry.claim.at + this.timing.claimExpireMs + 1);
            moments.forEach((moment) => {
                if (moment > now && (next === null || moment < next))
                    next = moment;
            });
        });
        return next;
    }
    ready(entries, now) {
        return Object.keys(entries || {})
            .map((code) => [code, entries[code]])
            .filter(([, entry]) => entry && entry.size > 0 && entry.at + this.timing.settleMs <= now && this.isFree(entry, now))
            .sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));
    }
}
MkMatcher.TIMING = { settleMs: 3000, claimExpireMs: 10000 };
// 두 편이 맞붙는 게임(24·25·30·34·35): 가장 먼저 온 팀과 그다음 준비된 팀을 묶고 편은 무작위.
class MkVersusMatcher extends MkMatcher {
    pick(ready) {
        const fitting = ready.filter(([, entry]) => entry.size <= this.partyLimit);
        if (fitting.length < 2 || fitting[0] !== ready[0])
            return null;
        return [fitting[0], fitting[1]];
    }
    sides(count, random) {
        return random() < 0.5 ? [0, 1] : [1, 0];
    }
}
// 여럿이 한 방에 모이는 게임(31·32·38·39): 먼저 온 순서로 정원까지 채우고, 넘치는 항목은 다음 묶음으로.
class MkFreeForAllMatcher extends MkMatcher {
    constructor(partyLimit, capacity, timing = MkMatcher.TIMING) {
        super(partyLimit, timing);
        this.capacity = capacity;
    }
    pick(ready) {
        const picked = [];
        let people = 0;
        ready.forEach((item) => {
            if (item[1].size <= this.partyLimit && people + item[1].size <= this.capacity) {
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
    streak() {
        let wins = 0;
        for (let index = this.lines.length - 1; index >= 0 && this.lines[index].result === "win"; index--)
            wins++;
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
            const result = await this.database.ref(this.paths.party(code)).transaction((current) => (MkPartyDirectory.isAlive(current) ? undefined : record));
            if (result.committed)
                return code;
        }
        return null;
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
            Object.keys(all).forEach((code) => {
                if (!MkPartyDirectory.isAlive(all[code]))
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
    setBots(count) {
        if (!this.isLeader() || this.searching())
            return;
        const allowed = Math.max(0, Math.min(count, this.limit - this.members().length));
        this.ref.child("bots").set(allowed);
    }
    updateMe(member) {
        if (this.record && this.record.members && this.record.members[this.myId])
            this.ref.child("members/" + this.myId).update({ nick: member.nick, look: member.look || null });
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
            const line = { n: Object.keys(history).length + 1, matchId: ticket.matchId, at, result: outcome.result, rivals: ticket.rivals || [] };
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
    async leave() {
        this.leaving = true;
        this.stopListening();
        try {
            this.ref.child("members/" + this.myId).onDisconnect().cancel();
        }
        catch (error) { /* 이미 끊긴 연결 */ }
        const wasLeader = this.isLeader();
        const searching = !!this.searching();
        await this.ref.transaction((current) => {
            const record = current;
            if (!record || !record.members || !record.members[this.myId])
                return record === null ? null : undefined;
            delete record.members[this.myId];
            if (!Object.keys(record.members).length)
                return null;
            if (record.leaderId === this.myId) {
                record.leaderId = MkParty.firstMember(record.members);
                record.search = null;
            }
            return record;
        });
        if (wasLeader && searching)
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
        if (this.leaving)
            return;
        if (!MkPartyDirectory.isAlive(record) || !record.members[this.myId]) {
            this.record = null;
            this.stopListening();
            this.onClosed("팀 대기실에서 나왔어요.");
            return;
        }
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
        this.onBound = () => undefined;
        this.onError = () => undefined;
    }
    async enter(party) {
        const since = this.clock.now();
        const people = {};
        party.members().forEach(([id, member]) => { people[id] = { nick: member.nick, joinedAt: member.joinedAt, look: member.look || null }; });
        const entry = { leader: party.myId, people, bots: party.bots(), size: party.size(), at: since, claim: null };
        const ref = this.database.ref(this.paths.entry(party.code));
        ref.onDisconnect().remove();
        await ref.set(entry);
        await party.markSearching(since);
        this.watch(party.code);
    }
    // 내 항목을 실제로 뺐을 때만 true. 누가 묶어 가는 중(claim)이거나 이미 묶여 빠졌으면 false — 곧 표가 온다.
    async cancel(party) {
        const ref = this.database.ref(this.paths.entry(party.code));
        let removed = false;
        const result = await ref.transaction((current) => {
            removed = false;
            const entry = current;
            if (!entry)
                return null;
            if (!this.matcher.isFree(entry, this.clock.now()))
                return undefined;
            removed = true;
            return null;
        });
        if (!result.committed)
            return false;
        this.stop();
        try {
            ref.onDisconnect().cancel();
        }
        catch (error) { /* 이미 끊긴 연결 */ }
        if (removed)
            await party.markSearching(null);
        return removed;
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
    watch(myCode) {
        this.stop();
        this.active = true;
        this.listener = this.database.ref(this.paths.queue).on("value", (snapshot) => {
            this.entries = snapshot.val();
            if (this.entries && !this.entries[myCode]) {
                this.stop();
                return;
            }
            this.consider(myCode);
        });
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
            const rivals = [];
            plan.groups.forEach((other) => {
                if (other !== group)
                    Object.keys(other.entry.people || {}).forEach((id) => rivals.push(other.entry.people[id].nick));
            });
            const ticket = { matchId: plan.matchId, room: made.room, side: group.side, host: made.host, expect, at, rivals };
            if (made.map)
                ticket.map = made.map;
            updates[this.paths.party(group.code) + "/match"] = ticket;
            updates[this.paths.party(group.code) + "/search"] = null;
        });
        await this.database.ref("").update(updates);
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
// 연승 표시 버튼. 누르면 이 팀 대기실의 모든 전적 창을 띄운다.
class MkStreakButton {
    constructor(host, showRank) {
        this.showRank = showRank;
        this.book = new MkRecordBook(null);
        this.element = document.createElement("button");
        this.element.type = "button";
        this.element.className = "mk-streak";
        this.element.addEventListener("click", () => this.dialog.show(this.book, this.showRank));
        this.dialog = new MkHistoryDialog(host);
        this.render(this.book);
    }
    render(book) {
        this.book = book;
        const label = book.streakLabel();
        if (this.element.textContent !== label)
            this.element.textContent = label;
        this.element.classList.toggle("hot", book.streak() > 0);
    }
}
// 전적 창. 그 게임 .st-screen 안에 붙어서 --st-* 색을 그대로 받는다.
class MkHistoryDialog {
    constructor(host) {
        this.onKey = (event) => { if (event.key === "Escape")
            this.hide(); };
        this.backdrop = document.createElement("div");
        this.backdrop.className = "mk-backdrop";
        this.backdrop.hidden = true;
        const card = document.createElement("div");
        card.className = "st-card mk-dialog";
        card.setAttribute("role", "dialog");
        const title = document.createElement("h2");
        title.textContent = "우리 팀 전적";
        this.summary = document.createElement("p");
        this.summary.className = "mk-summary";
        this.list = document.createElement("ol");
        this.list.className = "mk-history";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "st-btn";
        close.textContent = "닫기";
        close.addEventListener("click", () => this.hide());
        card.append(title, this.summary, this.list, close);
        this.backdrop.appendChild(card);
        this.backdrop.addEventListener("click", (event) => { if (event.target === this.backdrop)
            this.hide(); });
        host.appendChild(this.backdrop);
    }
    show(book, showRank) {
        this.summary.textContent = book.lines.length ? book.summary() + " · 지금 " + (book.streak() > 0 ? book.streak() + "연승" : "연승 없음") : "아직 경기가 없어요";
        this.list.textContent = "";
        book.lines.forEach((line) => this.list.appendChild(this.row(line, showRank)));
        this.backdrop.hidden = false;
        document.addEventListener("keydown", this.onKey);
    }
    hide() {
        this.backdrop.hidden = true;
        document.removeEventListener("keydown", this.onKey);
    }
    row(line, showRank) {
        const item = document.createElement("li");
        item.className = "mk-line " + line.result;
        const order = document.createElement("span");
        order.className = "mk-n";
        order.textContent = line.n + "판";
        const mark = document.createElement("b");
        mark.className = "mk-mark";
        mark.textContent = MkHistoryDialog.MARKS[line.result] + (showRank && line.rank ? " " + line.rank + "위/" + (line.of || "?") : "");
        const detail = document.createElement("span");
        detail.className = "mk-detail";
        const parts = [line.rivals && line.rivals.length ? "vs " + line.rivals.join(", ") : "vs AI"];
        if (line.map)
            parts.push(line.map);
        detail.textContent = parts.join(" · ");
        const time = document.createElement("span");
        time.className = "mk-time";
        time.textContent = MkHistoryDialog.clock(line.at);
        item.append(order, mark, detail, time);
        return item;
    }
    static clock(at) {
        const date = new Date(at);
        return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    }
}
MkHistoryDialog.MARKS = { win: "승", draw: "무", lose: "패" };
