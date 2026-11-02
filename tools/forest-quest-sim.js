const { SimConfig, IslandSim } = require("./forest-sim.js");

class QuestRule {
  constructor(id, name) { this.id = id; this.name = name; }
  static firstDay(daily, passes) {
    for (let day = 1; day < daily.length; day++) if (passes(daily[day])) return day;
    return Infinity;
  }
}

class CountRule extends QuestRule {
  constructor(id, name, requirements) { super(id, name); this.requirements = requirements; }
  needOf(requirement, people) { return requirement.scaled ? Math.ceil(requirement.base * people / 10) : requirement.base; }
  doneDay(island, people) {
    return Math.max(...this.requirements.map((r) => QuestRule.firstDay(island.tally.daily, (d) => (d[r.key] || 0) >= this.needOf(r, people))));
  }
  roleShare(island) {
    const key = this.requirements[0].key;
    const byRole = island.tally.byRole[key] || {};
    const total = Object.keys(byRole).reduce((s, r) => s + byRole[r], 0);
    if (!total) return "";
    const top = Object.keys(byRole).sort((a, b) => byRole[b] - byRole[a])[0];
    return top + " " + Math.round(byRole[top] / total * 100) + "%";
  }
}

class BuildRule extends QuestRule {
  constructor(id, name, builds) { super(id, name); this.builds = builds; }
  doneDay(island) {
    const days = island.milestones.sessions || {};
    return Math.max(...this.builds.map((b) => days[b.id + "#" + b.count] || Infinity));
  }
  roleShare() { return ""; }
}

class QuestSimConfig {}
QuestSimConfig.CHAPTERS = [
  { name: "1장 첫 불씨", rules: [
    new BuildRule("1-1", "작업대를 세우자", [{ id: "workbench", count: 1 }]),
    new CountRule("1-2", "숲에 빈터를(벌목 5번=1칸 가정)", [{ key: "chop", base: 100, scaled: true }]),
    new CountRule("1-3", "첫 도구 공방", [{ key: "woodGear", base: 12, scaled: true }]),
  ] },
  { name: "2장 길을 열다", rules: [
    new BuildRule("2-1", "강 위의 다리", [{ id: "bridge_east", count: 1 }, { id: "bridge_south", count: 1 }]),
    new BuildRule("2-2", "계단 마을", [{ id: "stairs", count: 3 }]),
    new BuildRule("2-3", "불을 다루다", [{ id: "forge", count: 1 }, { id: "oven", count: 1 }]),
    new CountRule("2-4", "광부의 날", [{ key: "ironDonated", base: 30, scaled: true }]),
  ] },
  { name: "3장 먹고사는 마을", rules: [
    new BuildRule("3-1", "텃밭 가꾸기(수로 제외)", [{ id: "farm_expand", count: 2 }]),
    new CountRule("3-3", "바다의 도감", [{ key: "fish", base: 30, scaled: true }, { key: "species", base: 8, scaled: false }]),
    new BuildRule("3-4", "밤을 밝히다", [{ id: "lamp", count: 8 }, { id: "kitchen", count: 1 }]),
  ] },
  { name: "4장 지키는 마을", rules: [
    new BuildRule("4-1", "성벽 두르기", [{ id: "wall", count: 12 }]),
    new BuildRule("4-2", "하늘 높이 망루", [{ id: "tower", count: 4 }]),
    new CountRule("4-3", "용감한 탐험대", [{ key: "trip", base: 40, scaled: true }]),
    new CountRule("4-4", "힘을 모아 반지를", [{ key: "ringUp", base: 8, scaled: true }]),
  ] },
  { name: "5장 동마의 축제", rules: [
    new BuildRule("5-1", "활짝 열린 성문", [{ id: "gate", count: 4 }]),
  ] },
];

class QuestSimRun {
  constructor(people, sessions) {
    this.people = people;
    this.sessions = sessions;
    SimConfig.BOTS = people;
    this.islands = [0, 7919, 15838].map((add, i) => new IslandSim(SimConfig.SEED + add, "섬 " + (i + 1)));
    this.islands.forEach((island) => island.run(sessions));
  }
  static sessionText(day) { return Number.isFinite(day) ? String(Math.ceil(day / SimConfig.DAYS_PER_SESSION)) : "—"; }
  report() {
    const lines = ["### 접속 " + this.people + "명 · 수업 " + this.sessions + "번 (섬 3개, 칸은 섬1/섬2/섬3의 완료 수업 번호)"];
    const chapterDone = this.islands.map(() => 0);
    QuestSimConfig.CHAPTERS.forEach((chapter) => {
      let waitSum = 0, waitCount = 0;
      lines.push(chapter.name);
      chapter.rules.forEach((rule) => {
        const days = this.islands.map((island) => rule.doneDay(island, this.people));
        days.forEach((d, i) => { chapterDone[i] = Math.max(chapterDone[i], d); });
        lines.push("  " + rule.id + " " + rule.name + ": " + days.map(QuestSimRun.sessionText).join("/") + "  " + rule.roleShare(this.islands[0]));
      });
      const done = chapterDone.map(QuestSimRun.sessionText).join("/");
      lines.push("  → 장 완료(앞 장 포함): " + done);
    });
    return lines.join("\n");
  }
}

const sessions = Number(process.argv[2] || 20);
[10, 6].forEach((people) => console.log(new QuestSimRun(people, sessions).report() + "\n"));
