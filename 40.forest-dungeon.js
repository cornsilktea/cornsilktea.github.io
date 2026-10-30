"use strict";
class FrMonster {
    constructor(def, x, z) {
        this.def = def;
        this.x = x;
        this.z = z;
        this.id = FrMonster.nextId++;
        this.state = "chase";
        this.timer = 0;
        this.flash = 0;
        this.facing = 0;
        this.vx = 0;
        this.vz = 0;
        this.deadFor = 0;
        this.hp = def.hp;
    }
}
FrMonster.nextId = 1;
class FrDungeonFight {
    constructor(difficulty, random, spawnSpots, walkable, pityStart = 0) {
        this.difficulty = difficulty;
        this.random = random;
        this.spawnSpots = spawnSpots;
        this.walkable = walkable;
        this.monsters = [];
        this.timeLeft = FrBalance.DUNGEON_SECONDS;
        this.health = FrBalance.PLAYER_HEALTH;
        this.kills = 0;
        this.ended = null;
        this.stun = 0;
        this.attackCooldown = 0;
        this.pity = 0;
        this.spawnTimer = 0.4;
        this.legendMiss = 0;
        this.flow = new Map();
        this.flowKey = -1;
        this.flowAge = 0;
        this.legendMiss = pityStart;
    }
    get legendMissCount() { return this.legendMiss; }
    alive() { return this.monsters.filter((m) => m.state !== "dead"); }
    update(dt, player, gear) {
        const events = [];
        if (this.ended)
            return events;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.stun = Math.max(0, this.stun - dt);
        this.spawn(dt, player, events);
        this.refreshFlow(player, dt);
        this.monsters.forEach((m) => this.step(m, dt, player, gear, events));
        for (let i = this.monsters.length - 1; i >= 0; i--)
            if (this.monsters[i].state === "dead" && (this.monsters[i].deadFor += dt) > 1.2)
                this.monsters.splice(i, 1);
        if (this.health <= 0) {
            this.ended = "dead";
            events.push({ t: "end", reason: "dead" });
        }
        else if (this.timeLeft <= 0) {
            this.ended = "time";
            events.push({ t: "end", reason: "time" });
        }
        return events;
    }
    cellOf(v) { return Math.floor(v / FrTerrainData.BLOCK); }
    cellKey(x, z) { return (z + 64) * 256 + (x + 64); }
    cellOpen(x, z) { const B = FrTerrainData.BLOCK; return this.walkable((x + 0.5) * B, (z + 0.5) * B); }
    refreshFlow(player, dt) {
        this.flowAge += dt;
        const px = this.cellOf(player.x), pz = this.cellOf(player.z);
        const key = this.cellKey(px, pz);
        if (key === this.flowKey && this.flowAge < 1)
            return;
        this.flowKey = key;
        this.flowAge = 0;
        const dist = new Map();
        const queue = [[px, pz]];
        dist.set(key, 0);
        for (let head = 0; head < queue.length && head < 2500; head++) {
            const [x, z] = queue[head];
            const d = dist.get(this.cellKey(x, z));
            for (const [dx, dz] of FrDungeonFight.EIGHT) {
                const nx = x + dx, nz = z + dz, k = this.cellKey(nx, nz);
                if (dist.has(k) || !this.cellOpen(nx, nz))
                    continue;
                if (dx !== 0 && dz !== 0 && (!this.cellOpen(x + dx, z) || !this.cellOpen(x, z + dz)))
                    continue;
                dist.set(k, d + 1);
                queue.push([nx, nz]);
            }
        }
        this.flow = dist;
    }
    chaseDirection(m, player) {
        const B = FrTerrainData.BLOCK;
        const cx = this.cellOf(m.x), cz = this.cellOf(m.z);
        const here = this.flow.get(this.cellKey(cx, cz));
        if (here === undefined || here <= 1) {
            const d = Math.hypot(player.x - m.x, player.z - m.z) || 1;
            return [(player.x - m.x) / d, (player.z - m.z) / d];
        }
        let best = here, tx = cx, tz = cz;
        for (const [dx, dz] of FrDungeonFight.EIGHT) {
            const v = this.flow.get(this.cellKey(cx + dx, cz + dz));
            if (v !== undefined && v < best) {
                best = v;
                tx = cx + dx;
                tz = cz + dz;
            }
        }
        const gx = (tx + 0.5) * B - m.x, gz = (tz + 0.5) * B - m.z, d = Math.hypot(gx, gz) || 1;
        return [gx / d, gz / d];
    }
    spawn(dt, player, events) {
        this.spawnTimer -= dt;
        if (this.spawnTimer > 0 || this.alive().length >= FrDungeonFight.MAX_ALIVE[this.difficulty])
            return;
        const B = FrTerrainData.BLOCK;
        const spots = this.spawnSpots.filter(([x, z]) => Math.hypot((x + 0.5) * B - player.x, (z + 0.5) * B - player.z) >= FrDungeonFight.SPAWN_SAFE);
        if (spots.length === 0)
            return;
        this.spawnTimer = FrDungeonFight.SPAWN_GAP;
        const [x, z] = this.random.pick(spots);
        const defs = FrCatalog.MONSTERS[this.difficulty];
        const def = this.difficulty === "hell" ? (this.random.chance(0.2) ? defs[2] : defs[this.random.between(0, 1)]) : defs[this.random.between(0, defs.length - 1)];
        const monster = new FrMonster(def, (x + 0.5) * B, (z + 0.5) * B);
        this.monsters.push(monster);
        events.push({ t: "spawn", monster });
    }
    step(m, dt, player, gear, events) {
        if (m.state === "dead")
            return;
        m.flash = Math.max(0, m.flash - dt);
        if (m.vx !== 0 || m.vz !== 0) {
            this.slide(m, m.vx * dt, m.vz * dt);
            m.vx *= Math.max(0, 1 - dt * 7);
            m.vz *= Math.max(0, 1 - dt * 7);
            if (Math.hypot(m.vx, m.vz) < 0.2) {
                m.vx = 0;
                m.vz = 0;
            }
        }
        const dx = player.x - m.x, dz = player.z - m.z, distance = Math.hypot(dx, dz);
        if (m.state === "chase") {
            m.facing = Math.atan2(dx, dz);
            if (distance <= FrDungeonFight.STRIKE_RANGE) {
                m.state = "windup";
                m.timer = FrBalance.MONSTER_WINDUP;
                events.push({ t: "windup", monster: m });
                return;
            }
            if (m.vx === 0 && m.vz === 0) {
                const [ux, uz] = this.chaseDirection(m, player);
                this.slide(m, ux * m.def.speed * dt, uz * m.def.speed * dt);
            }
        }
        else if (m.state === "windup") {
            m.timer -= dt;
            if (m.timer <= 0) {
                if (distance <= FrDungeonFight.HIT_RANGE) {
                    const damage = FrDungeonRules.damageTaken(m.def.attack, gear.reduction);
                    this.health = Math.max(0, this.health - damage);
                    events.push({ t: "hurt", damage });
                }
                m.state = "recover";
                m.timer = FrDungeonFight.RECOVER;
            }
        }
        else if (m.state === "recover") {
            m.timer -= dt;
            if (m.timer <= 0)
                m.state = "chase";
        }
    }
    slide(m, dx, dz) {
        if (this.walkable(m.x + dx, m.z))
            m.x += dx;
        if (this.walkable(m.x, m.z + dz))
            m.z += dz;
    }
    attack(player, gear) {
        const events = [];
        if (this.ended || this.attackCooldown > 0 || this.stun > 0)
            return events;
        this.attackCooldown = FrBalance.ATTACK_INTERVAL;
        const damage = FrDungeonRules.weaponDamage(gear.weaponTier);
        this.monsters.forEach((m) => {
            if (m.state === "dead" || !FrDungeonRules.inAttackArc(m.x - player.x, m.z - player.z, player.facing))
                return;
            m.hp -= damage;
            m.flash = 0.2;
            const away = Math.hypot(m.x - player.x, m.z - player.z) || 1;
            m.vx = ((m.x - player.x) / away) * FrDungeonFight.KNOCKBACK * 7;
            m.vz = ((m.z - player.z) / away) * FrDungeonFight.KNOCKBACK * 7;
            if (m.state === "windup") {
                m.state = "recover";
                m.timer = FrDungeonFight.RECOVER * 0.6;
            }
            events.push({ t: "hit", monster: m, damage });
            if (m.hp <= 0)
                this.kill(m, events);
        });
        return events;
    }
    kill(m, events) {
        m.state = "dead";
        m.deadFor = 0;
        this.kills += 1;
        const roll = FrDungeonDrops.roll(this.random, this.difficulty, this.legendMiss);
        this.legendMiss = roll.gotLegend ? 0 : this.legendMiss + 1;
        events.push({ t: "kill", monster: m, drops: roll.items, legend: roll.gotLegend });
    }
    heal(amount) {
        if (this.health >= FrBalance.PLAYER_HEALTH || this.ended)
            return false;
        this.health = Math.min(FrBalance.PLAYER_HEALTH, this.health + amount);
        this.stun = FrDungeonFight.STUN;
        return true;
    }
    leave() {
        if (this.ended)
            return [];
        this.ended = "left";
        return [{ t: "end", reason: "left" }];
    }
}
FrDungeonFight.SPAWN_GAP = 1.35;
FrDungeonFight.MAX_ALIVE = { normal: 5, hard: 5, hell: 4 };
FrDungeonFight.STRIKE_RANGE = 2.2;
FrDungeonFight.HIT_RANGE = 2.7;
FrDungeonFight.RECOVER = 1.1;
FrDungeonFight.KNOCKBACK = 1.6;
FrDungeonFight.SPAWN_SAFE = 7;
FrDungeonFight.STUN = 1;
FrDungeonFight.EIGHT = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
class FrDungeonInfo {
    static dropIds(difficulty) { return FrCatalog.DROPS[difficulty].map((d) => d.item); }
    static monsterNames(difficulty) {
        const seen = [];
        FrCatalog.MONSTERS[difficulty].forEach((m) => { if (seen.indexOf(m.name) < 0)
            seen.push(m.name); });
        return seen;
    }
    static armorOf(session) {
        return { helmet: session.bag.bestTier("helmet"), top: session.bag.bestTier("top"), bottom: session.bag.bestTier("bottom"), shoes: session.bag.bestTier("shoes") };
    }
    static gearOf(session) {
        return { weaponTier: session.bag.bestTier("weapon"), reduction: FrDungeonRules.armorReduction(FrDungeonInfo.armorOf(session)) };
    }
}
FrDungeonInfo.NAMES = { normal: "노말", hard: "하드", hell: "헬" };
FrDungeonInfo.KIND = { normal: "moss", hard: "crystal", hell: "lava" };
FrDungeonInfo.CAVE_NAMES = { normal: "이끼 동굴", hard: "수정 동굴", hell: "용암 동굴" };
FrDungeonInfo.SUMMARY = { normal: "맨손으로도 괜찮아요", hard: "철 장비를 추천해요", hell: "다이아몬드 장비가 있으면 든든해요" };
FrDungeonInfo.RECOMMENDED = { normal: "맨손 · 나무 무기", hard: "철 무기 · 철 방어구", hell: "다이아몬드 무기 · 철 이상 방어구" };
FrDungeonInfo.STAT_ENTER = { normal: "dungeonNormal", hard: "dungeonHard", hell: "dungeonHell" };
FrDungeonInfo.STAT_KILL = { normal: "killNormal", hard: "killHard", hell: "killHell" };
class FrRingKit {
    static ringSlots(session) { return session.bag.slots.filter((s) => s.id === "ring"); }
    static best(session) {
        const rings = FrRingKit.ringSlots(session);
        if (rings.length === 0)
            return null;
        return rings.reduce((a, b) => (b.uses > a.uses ? b : a));
    }
    static level(session) {
        const best = FrRingKit.best(session);
        return best ? best.uses : 0;
    }
    static spare(session) {
        const best = FrRingKit.best(session);
        return FrRingKit.ringSlots(session).filter((s) => s !== best);
    }
    static enhanceCost(session) {
        const best = FrRingKit.best(session);
        if (!best || best.uses >= FrBalance.RING_MAX_LEVEL)
            return null;
        const target = best.uses + 1;
        return { ...FrRingRules.cost(target), rate: FrRingRules.successRate(target) };
    }
    static enhance(session, random) {
        const best = FrRingKit.best(session);
        const cost = FrRingKit.enhanceCost(session);
        if (!best || !cost || session.bag.count("enhance_stone") < cost.enhance || session.bag.count("magic_stone") < cost.magic)
            return { done: false, success: false, level: best ? best.uses : 0 };
        session.bag.take("enhance_stone", cost.enhance);
        session.bag.take("magic_stone", cost.magic);
        const result = FrRingRules.attempt(best.uses, random);
        best.uses = result.level;
        session.stats.atLeast("ringLevel", best.uses);
        session.changed();
        return { done: true, success: result.success, level: best.uses };
    }
    static melt(session) {
        const spare = FrRingKit.spare(session)[0];
        if (!spare)
            return false;
        session.bag.slots.splice(session.bag.slots.indexOf(spare), 1);
        session.gain("enhance_stone", FrBalance.RING_MELT_ENHANCE);
        return true;
    }
}
