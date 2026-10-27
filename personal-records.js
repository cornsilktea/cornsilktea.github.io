"use strict";
/* =====================================================================
   계정별 개인 기록 (공용 모듈, 로그인한 학생만)

   저장 위치(Realtime Database, 본인만 읽고 쓴다 — 데이터베이스규칙.json 의 users):
     users/<uid>/profile                     { name, email, at, cls? }  cls 는 반 링크로 처음 로그인할 때 한 번만("2-5")
     users/<uid>/stats/teambattle · recent   30번 팀 배틀 계정 통계·최근 매치(account-stats.ts)
     users/<uid>/best/<게임>/<key>           { score, lower, at }  게임별 개인 최고 기록 (더 좋을 때만 덮어씀)
     users/<uid>/localBests/<기기 저장 키>    { raw, at }  이 기기에 있던 localStorage 최고 기록을 처음 로그인할 때 한 번 옮겨 둔 것

   사용법(로그인 상태인 학생 기기에서만 의미가 있다)
     const best = new PersonalBest("snakegame");                  // 작을수록 좋은 기록이면 { lower: true }, 곡·코스별이면 { key: "곡아이디" }
     best.report(점수).then((갱신됨) => …);                        // 로그인 전이면 false
     best.load().then((기록 | null) => …);

   이 파일은 account-login.js 가 로그인에 성공하면 불러온다. 따로 script 로 넣는 자료는 로그인한 반별 링크에서만 쓴다.
   과제 제출·RPG 성장도 users/<uid>/ 아래 가지를 늘려 같은 AccountDatabase 로 읽고 쓰면 된다.
   ===================================================================== */
class AccountDatabase {
    constructor(user) {
        this.user = user;
    }
    async read(path) {
        const response = await fetch(await this.address(path), { cache: "no-store" });
        if (!response.ok)
            throw new Error(String(response.status));
        return (await response.json());
    }
    async write(path, value) {
        await this.send("PUT", await this.address(path), value);
    }
    /* 부분 수정(PATCH): 적은 필드만 바뀌고 나머지(예: profile.cls)는 그대로 남는다 */
    async update(path, value) {
        await this.send("PATCH", await this.address(path), value);
    }
    /* 여러 가지(users/<uid>/… 와 classStats/… 처럼 users 밖 경로 포함)를 한 번의 요청으로 함께 쓴다. 키는 루트 기준 경로 */
    async updateRoot(values) {
        await this.send("PATCH", await this.rootAddress(), values);
    }
    /* print=silent: 서버가 방금 쓴 내용을 응답으로 되돌려 보내지 않게 해 다운로드 사용량을 줄인다(2026-10-27 선생님 결정, 요청 횟수는 그대로) */
    async send(method, url, value) {
        const response = await fetch(url + "&print=silent", {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(value)
        });
        if (!response.ok)
            throw new Error(String(response.status));
    }
    async address(path) {
        return this.urlOf("/users/" + this.user.uid + "/" + path);
    }
    async rootAddress() {
        return this.urlOf("/");
    }
    async urlOf(path) {
        const config = window.PORTAL_CONFIG;
        if (!config || !config.isReady())
            throw new Error("no-db");
        const token = await this.user.getToken();
        const base = config.DB_URL.replace(/\/+$/, "");
        return base + path + ".json?auth=" + encodeURIComponent(token);
    }
}
class PersonalBest {
    constructor(game, options = {}) {
        this.row = null;
        this.loaded = false;
        this.path = "best/" + game + "/" + (options.key || "all");
        this.lower = !!options.lower;
    }
    async load() {
        const user = window.PORTAL_USER;
        if (!user)
            return null;
        this.row = await new AccountDatabase(user).read(this.path);
        this.loaded = true;
        return this.row;
    }
    async report(score) {
        const user = window.PORTAL_USER;
        if (!user || !isFinite(score) || score < 0)
            return false;
        if (!this.loaded)
            await this.load();
        if (!this.isBetter(score))
            return false;
        await new AccountDatabase(user).write(this.path, { score, lower: this.lower, at: { ".sv": "timestamp" } });
        this.row = { score, lower: this.lower, at: Date.now() };
        return true;
    }
    isBetter(score) {
        if (!this.row)
            return true;
        return this.lower ? score < this.row.score : score > this.row.score;
    }
}
class LocalBestMigrator {
    constructor(user, database) {
        this.user = user;
        this.database = database;
    }
    async migrateOnce() {
        const doneKey = LocalBestMigrator.DONE_PREFIX + this.user.uid;
        if (this.readFlag(doneKey))
            return;
        const found = this.collectLocalBests();
        if (found.length > 0) {
            const existing = (await this.database.read("localBests")) || {};
            for (const [key, raw] of found) {
                if (existing[key])
                    continue;
                await this.database.write("localBests/" + key, { raw, at: { ".sv": "timestamp" } });
            }
        }
        this.writeFlag(doneKey);
    }
    collectLocalBests() {
        const found = [];
        try {
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index) || "";
                const raw = localStorage.getItem(key) || "";
                const usable = LocalBestMigrator.KEY_PATTERN.test(key) && raw.length > 0 && raw.length <= LocalBestMigrator.MAX_RAW_LENGTH;
                if (usable)
                    found.push([key, raw]);
            }
        }
        catch (error) {
            return [];
        }
        return found;
    }
    readFlag(key) {
        try {
            return localStorage.getItem(key) === "1";
        }
        catch (error) {
            return false;
        }
    }
    writeFlag(key) {
        try {
            localStorage.setItem(key, "1");
        }
        catch (error) {
            return;
        }
    }
}
LocalBestMigrator.KEY_PATTERN = /^[a-z0-9]+_best(?:_v[0-9]+)?$/;
LocalBestMigrator.MAX_RAW_LENGTH = 2000;
LocalBestMigrator.DONE_PREFIX = "account_migrated_";
/* 학생의 반(profile.cls, "2-5" 형식)은 반 링크(?c=1-1 … 2-5)로 처음 로그인할 때 한 번만 적는다.
   대회서버·배포용 링크는 반을 알 수 없어 적지 않는다(미분류). 규칙이 한 번 적힌 반은 선생님 계정만 고치게 막으므로,
   다른 반 링크로 들어와 거부되면 cls 없이 다시 쓰고, 이 기기에는 "이미 처리함" 표시를 남겨 다음 로그인부터는 시도하지 않는다
   (그래서 보통은 로그인 한 번당 요청 1회 그대로). 선생님 계정은 칠판에서 반 링크로 로그인하므로 적지 않는다. */
class AccountClassClaim {
    constructor(user) {
        this.user = user;
    }
    pending() {
        const klass = window.PORTAL_CLASS;
        if (!klass || !AccountClassClaim.CLASS_PATTERN.test(klass.id))
            return null;
        if (AccountPolicy.ADMIN_UIDS.indexOf(this.user.uid) >= 0)
            return null;
        return this.readDone() === klass.id ? null : klass.id;
    }
    markDone(cls) {
        try {
            localStorage.setItem(AccountClassClaim.DONE_PREFIX + this.user.uid, cls);
        }
        catch (error) {
            return;
        }
    }
    readDone() {
        try {
            return localStorage.getItem(AccountClassClaim.DONE_PREFIX + this.user.uid) || "";
        }
        catch (error) {
            return "";
        }
    }
}
AccountClassClaim.CLASS_PATTERN = /^[12]-[1-5]$/;
AccountClassClaim.DONE_PREFIX = "account_cls_";
class AccountRecordsStarter {
    start() {
        const user = window.PORTAL_USER;
        if (!user)
            return;
        const database = new AccountDatabase(user);
        this.writeProfile(user, database)
            .then(() => new LocalBestMigrator(user, database).migrateOnce())
            .catch(() => undefined);
    }
    async writeProfile(user, database) {
        const profile = { name: user.name, email: user.email, at: { ".sv": "timestamp" } };
        const claim = new AccountClassClaim(user);
        const cls = claim.pending();
        if (!cls) {
            await database.update("profile", profile);
            return;
        }
        try {
            await database.update("profile", Object.assign({ cls }, profile));
        }
        catch (error) {
            await database.update("profile", profile);
        }
        claim.markDone(cls);
    }
}
new AccountRecordsStarter().start();
