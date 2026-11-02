"use strict";
class FrQuestRequirement {
    constructor() {
        this.shown = true;
    }
    met(board) { return this.have(board) >= this.need(board); }
}
class FrCountRequirement extends FrQuestRequirement {
    constructor(key, base) {
        super();
        this.key = key;
        this.base = base;
    }
    static scaled(base, people) {
        const clamped = Math.max(FrCountRequirement.MIN_PEOPLE, Math.min(FrCountRequirement.FULL_PEOPLE, people));
        return Math.ceil(base * clamped / FrCountRequirement.FULL_PEOPLE);
    }
    have(board) { return board.count(this.key); }
    need(board) { return FrCountRequirement.scaled(this.base, board.people()); }
}
FrCountRequirement.MIN_PEOPLE = 3;
FrCountRequirement.FULL_PEOPLE = 10;
class FrFixedRequirement extends FrQuestRequirement {
    constructor(key, amount) {
        super();
        this.key = key;
        this.amount = amount;
    }
    have(board) { return board.count(this.key); }
    need() { return this.amount; }
}
class FrSpeciesRequirement extends FrQuestRequirement {
    constructor(group, amount) {
        super();
        this.group = group;
        this.amount = amount;
        this.shown = false;
    }
    have(board) { return board.speciesCount(this.group); }
    need() { return this.amount; }
}
class FrBuildRequirement extends FrQuestRequirement {
    constructor(id, amount) {
        super();
        this.id = id;
        this.amount = amount;
    }
    have(board) { return Math.min(this.amount, board.built(this.id)); }
    need() { return this.amount; }
}
class FrQuestMission {
    constructor(id, name, chapter, requirements) {
        this.id = id;
        this.name = name;
        this.chapter = chapter;
        this.requirements = requirements;
    }
    complete(board) { return this.requirements.every((r) => r.met(board)); }
    have(board) {
        return this.requirements.filter((r) => r.shown).reduce((sum, r) => sum + Math.min(r.have(board), r.need(board)), 0);
    }
    need(board) {
        return this.requirements.filter((r) => r.shown).reduce((sum, r) => sum + r.need(board), 0);
    }
}
class FrQuestCatalog {
    static forChapter(chapter) { return FrQuestCatalog.MISSIONS.filter((m) => m.chapter === chapter); }
    static build() {
        const count = (key, base) => new FrCountRequirement(key, base);
        const built = (id, amount = 1) => new FrBuildRequirement(id, amount);
        const m = (id, name, requirements) => new FrQuestMission(id, name, Number(id.charAt(0)), requirements);
        return [
            m("1-1", "작업대를 세우자", [built("workbench")]),
            m("1-2", "숲에 빈터를", [count("cleared", 20)]),
            m("1-3", "첫 도구 공방", [count("woodGear", 20)]),
            m("1-4", "모닥불 식탁", [count("cook", 20)]),
            m("2-1", "강 위의 다리", [built("bridge_east"), built("bridge_south")]),
            m("2-2", "계단 마을", [built("stairs", 3)]),
            m("2-3", "불을 다루다", [built("forge"), built("oven")]),
            m("2-4", "광부의 날", [count("ironDonated", 70)]),
            m("3-1", "텃밭 가꾸기", [built("farm_expand", 2)]),
            m("3-2", "풍년", [count("harvest", 40), new FrSpeciesRequirement("crop", 6)]),
            m("3-3", "바다의 도감", [count("fish", 90), new FrSpeciesRequirement("fish", 8)]),
            m("3-4", "밤을 밝히다", [built("lamp", 8), built("kitchen")]),
            m("4-1", "성벽 두르기", [built("wall", 12)]),
            m("4-2", "하늘 높이 망루", [built("tower", 4)]),
            m("4-3", "용감한 탐험대", [count("trip", 150)]),
            m("4-4", "힘을 모아 반지를", [count("ringUp", 8)]),
            m("5-1", "활짝 열린 성문", [built("gate", 4)]),
            m("5-2", "우리 마을 집들이", [count("house", 10)]),
            m("5-3", "마을 잔치", [count("cook4", 15)]),
            m("5-4", "축제의 밤", [new FrFixedRequirement("allSleep", 3)]),
        ];
    }
}
FrQuestCatalog.CHAPTER_NAMES = ["", "첫 불씨", "길을 열다", "먹고사는 마을", "지키는 마을", "동마의 축제"];
FrQuestCatalog.MISSIONS = FrQuestCatalog.build();
class FrQuestBoard {
    constructor(backend, island, villageOf, peopleNow) {
        this.backend = backend;
        this.island = island;
        this.villageOf = villageOf;
        this.peopleNow = peopleNow;
        this.onChange = () => undefined;
        this.onMissionDone = () => undefined;
        this.remoteCounts = new Map();
        this.pending = new Map();
        this.species = new Map();
        this.doneIds = new Set();
        this.unsentSpecies = [];
        this.unsentDone = [];
        this.flushTimer = 0;
        this.holding = () => false;
    }
    path(rest) { return "forest/" + this.island + "/quest/" + rest; }
    async load() {
        const data = await this.backend.get(this.path(""));
        if (!data)
            return;
        Object.keys(data.n || {}).forEach((key) => this.remoteCounts.set(key, Number(data.n[key])));
        Object.keys(data.sp || {}).forEach((key) => this.addSpecies(key));
        Object.keys(data.done || {}).forEach((id) => this.doneIds.add(id));
    }
    count(key) { return (this.remoteCounts.get(key) || 0) + (this.pending.get(key) || 0); }
    speciesCount(group) { return (this.species.get(group) || new Set()).size; }
    built(id) { return this.villageOf().builtCount(id); }
    people() { return this.peopleNow(); }
    isDone(id) { return this.doneIds.has(id); }
    record(key, amount = 1) {
        this.pending.set(key, (this.pending.get(key) || 0) + amount);
        this.scheduleFlush();
        this.evaluate();
    }
    recordSpecies(group, id) {
        const key = group + "_" + id;
        if (this.addSpecies(key)) {
            this.unsentSpecies.push(key);
            this.scheduleFlush();
        }
        this.evaluate();
    }
    remoteCount(key, value) {
        this.remoteCounts.set(key, Math.max(this.remoteCounts.get(key) || 0, value));
        this.evaluate();
    }
    remoteSpecies(key) { if (this.addSpecies(key))
        this.evaluate(); }
    remoteDone(id) {
        if (this.doneIds.has(id))
            return;
        this.doneIds.add(id);
        this.onChange();
    }
    evaluate() {
        FrQuestCatalog.MISSIONS.forEach((mission) => {
            if (this.doneIds.has(mission.id) || !mission.complete(this))
                return;
            this.doneIds.add(mission.id);
            this.unsentDone.push(mission.id);
            this.scheduleFlush();
            this.onMissionDone(mission);
        });
        this.onChange();
    }
    addSpecies(key) {
        const group = key.split("_")[0];
        const set = this.species.get(group) || new Set();
        if (set.has(key))
            return false;
        set.add(key);
        this.species.set(group, set);
        return true;
    }
    release() { this.scheduleFlush(); }
    scheduleFlush() {
        if (this.flushTimer || this.holding())
            return;
        this.flushTimer = window.setTimeout(() => { this.flushTimer = 0; void this.flush(); }, FrQuestBoard.FLUSH_MS);
    }
    async flush() {
        const batch = Array.from(this.pending.entries());
        this.pending.clear();
        this.unsentSpecies.splice(0).forEach((key) => void this.backend.set(this.path("sp/" + key), 1));
        this.unsentDone.splice(0).forEach((id) => void this.backend.set(this.path("done/" + id), 1));
        for (const [key, delta] of batch) {
            this.remoteCounts.set(key, (this.remoteCounts.get(key) || 0) + delta);
            try {
                const result = await this.backend.transaction(this.path("n/" + key), (current) => (current || 0) + delta);
                if (result.committed && typeof result.value === "number")
                    this.remoteCounts.set(key, Math.max(this.remoteCounts.get(key) || 0, result.value));
            }
            catch (error) {
                this.pending.set(key, (this.pending.get(key) || 0) + delta);
                this.remoteCounts.set(key, Math.max(0, (this.remoteCounts.get(key) || 0) - delta));
            }
        }
        this.onChange();
    }
}
FrQuestBoard.FLUSH_MS = 2000;
class FrQuestNode {
    constructor(board) {
        this.board = board;
    }
    apply(rest, value) {
        if (rest.length === 0) {
            const table = (value || {});
            this.section("n", table.n);
            this.section("sp", table.sp);
            this.section("done", table.done);
            return;
        }
        if (rest.length === 1) {
            this.section(rest[0], value);
            return;
        }
        this.entry(rest[0], rest[1], value);
    }
    section(name, value) {
        const table = (value || {});
        Object.keys(table).forEach((key) => this.entry(name, key, table[key]));
    }
    entry(name, key, value) {
        if (value === null || value === undefined)
            return;
        if (name === "n")
            this.board.remoteCount(key, Number(value));
        else if (name === "sp")
            this.board.remoteSpecies(key);
        else if (name === "done")
            this.board.remoteDone(key);
    }
}
class FrQuestPanel {
    constructor(root, board, levelOf) {
        this.root = root;
        this.board = board;
        this.levelOf = levelOf;
        this.lastSignature = "";
    }
    render() {
        const chapter = Math.max(1, Math.min(5, this.levelOf()));
        const missions = FrQuestCatalog.forChapter(chapter);
        const rows = missions.map((mission) => {
            const done = this.board.isDone(mission.id);
            return { mission, done, text: mission.name + (done ? " (완료)" : " (" + mission.have(this.board) + "/" + mission.need(this.board) + ")") };
        });
        const signature = chapter + "|" + rows.map((r) => r.text).join("|");
        if (signature === this.lastSignature)
            return;
        this.lastSignature = signature;
        FrDom.clear(this.root);
        this.root.appendChild(FrDom.make("div", "fr-quest-head", "마을 " + chapter + "단계 퀘스트 · " + FrQuestCatalog.CHAPTER_NAMES[chapter]));
        rows.forEach((row) => this.root.appendChild(FrDom.make("div", row.done ? "fr-quest-row done" : "fr-quest-row", row.text)));
    }
}
