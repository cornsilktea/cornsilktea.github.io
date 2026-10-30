const F = require("./forest-load.js")();
const { FrBalance, FrCatalog, FrRandom, FrTerrainData, FrWorld, FrLocalBackend, FrSession, FrDungeonFight, FrDungeonInfo, FrRingKit, FrDungeonRules } = F;
const fs = require("fs"), path = require("path");

let passed = 0;
const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
const terrainFile = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/forest/island-terrain.json"), "utf8"));
const world = new FrWorld("t", new FrTerrainData(terrainFile), new FrLocalBackend(false));
const cave = (kind) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/forest/dungeon-cave-" + kind + ".json"), "utf8"));
const B = 2;

class BotRun {
  constructor(difficulty, weaponTier, armor, seed) {
    this.data = cave(FrDungeonInfo.KIND[difficulty]);
    const rows = this.data.rows;
    this.walkable = (x, z) => { const cx = Math.floor(x / B), cz = Math.floor(z / B); return cz >= 0 && cz < rows.length && rows[cz][cx] === "."; };
    this.fight = new FrDungeonFight(difficulty, new FrRandom(seed), this.data.spawnSpots, this.walkable);
    this.player = { x: (this.data.start[0] + 0.5) * B, z: (this.data.start[1] + 0.5) * B, facing: 0 };
    this.gear = { weaponTier, reduction: FrDungeonRules.armorReduction({ helmet: armor, top: armor, bottom: armor, shoes: armor }) };
    this.loot = {};
  }
  pathDirection(target) {
    const cell = (v) => Math.floor(v / B), key = (x, z) => z * 100 + x;
    const goal = [cell(target.x), cell(target.z)], start = [cell(this.player.x), cell(this.player.z)];
    const prev = new Map([[key(goal[0], goal[1]), null]]); const queue = [goal];
    for (let h = 0; h < queue.length; h++) {
      const [x, z] = queue[h];
      if (x === start[0] && z === start[1]) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => { const nx = x + dx, nz = z + dz; if (prev.has(key(nx, nz)) || !this.walkable((nx + 0.5) * B, (nz + 0.5) * B)) return; prev.set(key(nx, nz), [x, z]); queue.push([nx, nz]); });
    }
    const next = prev.get(key(start[0], start[1]));
    const tx = next ? (next[0] + 0.5) * B : target.x, tz = next ? (next[1] + 0.5) * B : target.z;
    const d = Math.hypot(tx - this.player.x, tz - this.player.z) || 1;
    return [(tx - this.player.x) / d, (tz - this.player.z) / d];
  }
  run() {
    const dt = 0.05;
    for (let t = 0; t < 60 && !this.fight.ended; t += dt) {
      const alive = this.fight.alive();
      let target = null, best = 1e9;
      alive.forEach((m) => { const d = Math.hypot(m.x - this.player.x, m.z - this.player.z); if (d < best) { best = d; target = m; } });
      const threat = alive.find((m) => m.state === "windup" && Math.hypot(m.x - this.player.x, m.z - this.player.z) < 2.9);
      if (threat && Math.random() < 1) {
        const away = Math.hypot(this.player.x - threat.x, this.player.z - threat.z) || 1;
        const nx = this.player.x + ((this.player.x - threat.x) / away) * 7.5 * dt, nz = this.player.z + ((this.player.z - threat.z) / away) * 7.5 * dt;
        if (this.walkable(nx, nz)) { this.player.x = nx; this.player.z = nz; }
        this.sinceAttack = (this.sinceAttack || 0) + dt;
        this.fight.update(dt, this.player, this.gear);
        continue;
      }
      if (target) {
        const dx = target.x - this.player.x, dz = target.z - this.player.z, d = Math.hypot(dx, dz);
        this.player.facing = Math.atan2(dx, dz);
        if (d > 1.6) {
          const dir = this.pathDirection(target);
          const step = 7.5 * dt, nx = this.player.x + dir[0] * step, nz = this.player.z + dir[1] * step;
          if (this.walkable(nx, nz)) { this.player.x = nx; this.player.z = nz; } else if (this.walkable(nx, this.player.z)) this.player.x = nx; else if (this.walkable(this.player.x, nz)) this.player.z = nz;
        }
      }
      this.sinceAttack = (this.sinceAttack || 0) + dt;
      const swing = this.sinceAttack >= 0.7 && target && Math.hypot(target.x - this.player.x, target.z - this.player.z) < 2.3;
      if (swing) this.sinceAttack = 0;
      const events = (swing ? this.fight.attack(this.player, this.gear) : []).concat(this.fight.update(dt, this.player, this.gear));
      events.forEach((e) => { if (e.t === "kill") Object.keys(e.drops).forEach((k) => { this.loot[k] = (this.loot[k] || 0) + e.drops[k]; }); });
    }
    return this;
  }
}

const avg = (difficulty, weapon, armor) => { let k = 0, hp = 0, dead = 0; for (let s = 1; s <= 20; s++) { const r = new BotRun(difficulty, weapon, armor, s).run(); k += r.fight.kills; hp += r.fight.health; if (r.fight.ended === "dead") dead++; } return { kills: k / 20, hp: hp / 20, dead }; };

const normal0 = avg("normal", 0, 0), normal3 = avg("normal", 3, 0), hard2 = avg("hard", 2, 2), hell3 = avg("hell", 3, 3), hell0 = avg("hell", 0, 0);
console.log("노말 맨손 평균 " + normal0.kills.toFixed(1) + "마리·체력 " + normal0.hp.toFixed(0) + " | 노말 다이아몬드 " + normal3.kills.toFixed(1) + "마리 | 하드 철 " + hard2.kills.toFixed(1) + " (체력 " + hard2.hp.toFixed(0) + ") | 헬 다이아몬드 " + hell3.kills.toFixed(1) + " (체력 " + hell3.hp.toFixed(0) + ", 쓰러짐 " + hell3.dead + "/20) | 헬 맨손 " + hell0.kills.toFixed(1) + " (쓰러짐 " + hell0.dead + "/20)");
check("노말 맨손: 40초에 8~18마리", normal0.kills >= 8 && normal0.kills <= 18, normal0.kills);
check("노말 다이아몬드 무기: 20~31마리", normal3.kills >= 20 && normal3.kills <= 31, normal3.kills);
check("노말은 맨손으로도 쓰러지지 않음", normal0.dead === 0, normal0.dead);
check("더 센 장비일수록 더 많이 잡음", normal3.kills > normal0.kills && hell3.kills > hell0.kills);
check("헬 맨손은 위험하고 헬 다이아몬드는 괜찮음", hell0.dead > hell3.dead && hell3.dead <= 9, [hell0.dead, hell3.dead]);

check("몬스터 드롭이 나옴", (() => { const r = new BotRun("hell", 3, 3, 5).run(); return r.fight.kills > 0 && Object.keys(r.loot).length > 0; })());
check("시간이 다 되면 40초에 끝남", (() => { const r = new BotRun("normal", 3, 3, 1).run(); return r.fight.ended === "time" && r.fight.timeLeft === 0; })());
check("체력이 0이면 끝남(쓰러짐)", (() => { const f = new FrDungeonFight("hell", new FrRandom(1), [[20, 20]], () => true); const p = { x: 4, z: 4, facing: 0 }; f.health = 1; for (let t = 0; t < 30 && !f.ended; t += 0.05) { f.update(0.05, p, { weaponTier: 0, reduction: 0 }); f.monsters.forEach((m) => { m.x = p.x; m.z = p.z + 1; }); } return f.ended === "dead"; })());
check("공격은 0.5초에 한 번", (() => { const f = new FrDungeonFight("normal", new FrRandom(1), [[9, 9]], () => true); const p = { x: 0, z: 0, facing: 0 }; const m = new F.FrMonster(FrCatalog.MONSTERS.normal[0], 0, 2); f.monsters.push(m); const g = { weaponTier: 0, reduction: 0 }; const a = f.attack(p, g).length; const b = f.attack(p, g).length; f.update(0.51, p, g); return a === 1 && b === 0 && f.attackCooldown === 0; })());
check("몬스터는 예고 뒤에 침 — 물러나면 피함", (() => { const f = new FrDungeonFight("normal", new FrRandom(1), [], () => true); const p = { x: 0, z: 0, facing: 0 }; const m = new F.FrMonster(FrCatalog.MONSTERS.normal[0], 0, 1.8); f.monsters.push(m); const g = { weaponTier: 0, reduction: 0 }; f.update(0.05, p, g); const wind = m.state === "windup"; p.z = -9; for (let i = 0; i < 20; i++) f.update(0.05, p, g); const dodged = f.health === 100; const m2 = new F.FrMonster(FrCatalog.MONSTERS.normal[0], 0, 1.8); f.monsters.push(m2); const p2 = { x: 0, z: 0, facing: 0 }; for (let i = 0; i < 15; i++) f.update(0.05, p2, g); return wind && dodged && f.health < 100; })());
check("방어구는 받는 피해를 줄임", (() => { const a = new BotRun("hell", 2, 0, 3).run(), b = new BotRun("hell", 2, 3, 3).run(); return b.fight.health >= a.fight.health; })());
check("음식을 먹으면 체력이 차고 1초 멈춤", (() => { const f = new FrDungeonFight("normal", new FrRandom(1), [], () => true); f.health = 40; const ok = f.heal(30); return ok && f.health === 70 && f.stun === 1 && !new FrDungeonFight("normal", new FrRandom(1), [], () => true).heal(10); })());
check("멈춘 동안은 공격 못 함", (() => { const f = new FrDungeonFight("normal", new FrRandom(1), [], () => true); f.health = 10; f.heal(5); return f.attack({ x: 0, z: 0, facing: 0 }, { weaponTier: 0, reduction: 0 }).length === 0; })());

const mk = () => new FrSession(world, "u", "나", 1);
check("반지: 가장 높은 단계가 끼는 반지, 나머지는 남는 반지", (() => { const s = mk(); s.bag.add("ring", 1, 3); s.bag.add("ring", 1, 1); return FrRingKit.level(s) === 3 && FrRingKit.spare(s).length === 1; })());
check("반지 강화: 재료 모자라면 안 됨, 있으면 쓰고 시도", (() => { const s = mk(); s.bag.add("ring", 1, 0); const no = FrRingKit.enhance(s, new FrRandom(1)).done; s.bag.add("enhance_stone", 5); s.bag.add("magic_stone", 5); const r = FrRingKit.enhance(s, new FrRandom(1)); return !no && r.done && s.bag.count("enhance_stone") === 4 && s.bag.count("magic_stone") === 4; })());
check("반지 강화: 실패해도 단계가 내려가지 않음", (() => { const s = mk(); s.bag.add("ring", 1, 9); s.bag.add("enhance_stone", 60); s.bag.add("magic_stone", 60); let min = 9; for (let i = 0; i < 6; i++) { const r = FrRingKit.enhance(s, new FrRandom(i + 1)); if (r.level < min) min = r.level; if (!r.done) break; } return min >= 9; })());
check("반지 녹이기: 남는 반지 하나가 강화석 3개", (() => { const s = mk(); s.bag.add("ring", 1, 2); s.bag.add("ring", 1, 0); const ok = FrRingKit.melt(s); return ok && s.bag.count("enhance_stone") === 3 && FrRingKit.ringSlots(s).length === 1 && !FrRingKit.melt(s); })());
check("반지 +10 이면 더 못 올림, 행동력 최대 200", (() => { const s = mk(); s.bag.add("ring", 1, 10); return FrRingKit.enhanceCost(s) === null && new F.FrActionPoints(FrRingKit.level(s)).max() === 200; })());
check("던전 안내: 등급별 이름·자원·몬스터", FrDungeonInfo.NAMES.hell === "헬" && FrDungeonInfo.dropIds("hell").indexOf("diamond") >= 0 && FrDungeonInfo.dropIds("normal").indexOf("ring") < 0 && FrDungeonInfo.monsterNames("hard").length === 2);

if (failures.length > 0) {
  console.log("던전 검사 실패 " + failures.length + "개 / 통과 " + passed + "개");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("던전 검사 모두 통과 " + passed + "개");
