"use strict";
class WarBotBrain {
    constructor(team, seed, profile) {
        this.team = team;
        this.profile = profile;
        this.weakSince = new Map();
        this.unitCycle = 0;
        this.random = new WarRandom(seed);
    }
    act(engine) {
        if (engine.tick % this.profile.thinkTicks !== this.team)
            return;
        const player = engine.players[this.team];
        this.growWorkers(engine, player);
        this.constructBuildings(engine, player);
        this.trainUnits(engine, player);
        this.commandSquads(engine, player);
    }
    growWorkers(engine, player) {
        const hq = player.hq;
        if (hq.queue.length >= 2)
            return;
        const economy = player.economy;
        if (economy.oreWorkers < this.profile.oreWorkerTarget)
            engine.submit(new WarProduceCommand(this.team, hq.id, "worker_ore"));
        else if (economy.crystalWorkers < this.profile.crystalWorkerTarget)
            engine.submit(new WarProduceCommand(this.team, hq.id, "worker_crystal"));
    }
    constructBuildings(engine, player) {
        const built = player.buildings().filter((b) => b.def.type !== "hq").length;
        if (built >= this.profile.buildingTarget)
            return;
        const slot = player.slotBuildings.findIndex((b, i) => !b && player.slotDefs[i].enabled);
        if (slot < 0)
            return;
        engine.submit(new WarBuildCommand(this.team, slot, this.profile.buildOrder[built % this.profile.buildOrder.length]));
    }
    baseThreatened(engine) {
        const hq = WarMapData.hq(this.team);
        const limitSq = WarBotBrain.THREAT_RADIUS * WarBotBrain.THREAT_RADIUS;
        for (const entity of engine.entitiesOf(this.team === 0 ? 1 : 0)) {
            if (!(entity instanceof WarUnit))
                continue;
            const dx = entity.x - hq.x;
            const dy = entity.y - hq.y;
            if (dx * dx + dy * dy <= limitSq && engine.vision.isVisible(this.team, entity.x, entity.y))
                return true;
        }
        return false;
    }
    pullBackIdleSquads(engine, player) {
        for (const squad of player.squads) {
            if (squad.mode === "away" && !squad.isEngaged())
                engine.submit(new WarRecallCommand(this.team, squad.index));
        }
    }
    wantsNextBuilding(player) {
        const built = player.buildings().filter((b) => b.def.type !== "hq").length;
        return built < this.profile.buildingTarget && player.slotBuildings.some((b, i) => !b && player.slotDefs[i].enabled);
    }
    trainUnits(engine, player) {
        if (this.wantsNextBuilding(player) && player.economy.ore < WarBotBrain.SAVE_FOR_BUILDING_ORE)
            return;
        for (const building of player.buildings()) {
            if (building.def.type === "hq" || !building.complete || building.queue.length >= this.profile.queueDepth)
                continue;
            const choices = WarUnitCatalog.producedBy(player.faction, building.def.type);
            const pick = choices[this.unitCycle++ % choices.length];
            engine.submit(new WarProduceCommand(this.team, building.id, pick.id));
        }
    }
    commandSquads(engine, player) {
        const enemy = this.team === 0 ? 1 : 0;
        const target = WarMapData.hq(enemy);
        const sign = WarMapData.sign(enemy);
        const lanes = [
            { x: -WarMapData.LANE_X, y: WarMapData.LANE_Y * sign },
            { x: 0, y: 0 },
            { x: WarMapData.LANE_X, y: WarMapData.LANE_Y * sign },
        ];
        const threatened = this.profile.defends && this.baseThreatened(engine);
        const ready = player.squads.filter((squad) => squad.mode === "home" && squad.members.length >= (squad.isFleet ? WarBotBrain.MIN_FLEET : this.profile.minSquadToSend));
        const readyPop = ready.reduce((sum, squad) => sum + squad.members.reduce((inner, unit) => inner + unit.def.pop, 0), 0);
        if (readyPop >= this.profile.launchArmyPop && !threatened) {
            const lane = lanes[this.random.below(lanes.length)];
            for (const squad of ready)
                engine.submit(new WarAttackPathCommand(this.team, squad.index, squad.isFleet ? [target] : [lane, target]));
        }
        for (const squad of player.squads) {
            const weak = squad.mode === "away" && squad.attachedMembers().length <= this.profile.retreatSquadSize;
            if (!weak) {
                this.weakSince.delete(squad.index);
                continue;
            }
            const since = this.weakSince.get(squad.index) ?? engine.tick;
            this.weakSince.set(squad.index, since);
            if (engine.tick - since >= WarBotBrain.RETREAT_PATIENCE_TICKS && !squad.isEngaged()) {
                engine.submit(new WarRecallCommand(this.team, squad.index));
                this.weakSince.delete(squad.index);
            }
        }
    }
}
WarBotBrain.SAVE_FOR_BUILDING_ORE = 150;
WarBotBrain.RETREAT_PATIENCE_TICKS = 60;
WarBotBrain.THREAT_RADIUS = 4200;
WarBotBrain.MIN_FLEET = 2;
class WarEasyBot extends WarBotBrain {
    constructor(team, seed) {
        super(team, seed, { thinkTicks: 40, oreWorkerTarget: 8, crystalWorkerTarget: 2, buildingTarget: 4, launchArmyPop: 28, minSquadToSend: 8, retreatSquadSize: 3, queueDepth: 2, defends: false, buildOrder: ["barracks", "barracks", "factory", "airport"] });
    }
}
class WarNormalBot extends WarBotBrain {
    constructor(team, seed) {
        super(team, seed, { thinkTicks: 20, oreWorkerTarget: 10, crystalWorkerTarget: 5, buildingTarget: 5, launchArmyPop: 24, minSquadToSend: 6, retreatSquadSize: 3, queueDepth: 2, defends: false, buildOrder: ["barracks", "factory", "airport", "barracks", "factory"] });
    }
}
class WarHardBot extends WarBotBrain {
    constructor(team, seed) {
        super(team, seed, { thinkTicks: 10, oreWorkerTarget: 10, crystalWorkerTarget: 5, buildingTarget: 5, launchArmyPop: 24, minSquadToSend: 6, retreatSquadSize: 3, queueDepth: 3, defends: true, buildOrder: ["barracks", "factory", "airport", "barracks", "factory"] });
    }
}
class WarBotFactory {
    static create(level, team, seed) {
        if (level === "easy")
            return new WarEasyBot(team, seed);
        if (level === "hard")
            return new WarHardBot(team, seed);
        return new WarNormalBot(team, seed);
    }
}
