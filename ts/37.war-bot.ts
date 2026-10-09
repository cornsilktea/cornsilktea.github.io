interface WarBotProfile {
  thinkTicks: number;
  oreWorkerTarget: number;
  crystalWorkerTarget: number;
  buildingTarget: number;
  attackSquadSize: number;
  retreatSquadSize: number;
  buildOrder: WarBuildingType[];
}

abstract class WarBotBrain {
  private readonly random: WarRandom;
  private unitCycle = 0;

  constructor(protected readonly team: WarTeam, seed: number, private readonly profile: WarBotProfile) {
    this.random = new WarRandom(seed);
  }

  act(engine: WarEngine): void {
    if (engine.tick % this.profile.thinkTicks !== this.team) return;
    const player = engine.players[this.team];
    this.growWorkers(engine, player);
    this.constructBuildings(engine, player);
    this.trainUnits(engine, player);
    this.commandSquads(engine, player);
  }

  private growWorkers(engine: WarEngine, player: WarPlayer): void {
    const hq = player.hq as WarBuilding;
    if (hq.queue.length >= 2) return;
    const economy = player.economy;
    if (economy.oreWorkers < this.profile.oreWorkerTarget) engine.submit(new WarProduceCommand(this.team, hq.id, "worker_ore"));
    else if (economy.crystalWorkers < this.profile.crystalWorkerTarget) engine.submit(new WarProduceCommand(this.team, hq.id, "worker_crystal"));
  }

  private constructBuildings(engine: WarEngine, player: WarPlayer): void {
    const built = player.buildings().filter((b) => b.def.type !== "hq").length;
    if (built >= this.profile.buildingTarget) return;
    const slot = player.slotBuildings.findIndex((b, i) => !b && player.slotDefs[i].enabled);
    if (slot < 0) return;
    engine.submit(new WarBuildCommand(this.team, slot, this.profile.buildOrder[built % this.profile.buildOrder.length]));
  }

  private trainUnits(engine: WarEngine, player: WarPlayer): void {
    for (const building of player.buildings()) {
      if (building.def.type === "hq" || !building.complete || building.queue.length >= 2 || building.def.producesKind === null) continue;
      const choices = WarUnitCatalog.producedBy(player.faction, building.def.producesKind);
      const pick = choices[this.unitCycle++ % choices.length];
      engine.submit(new WarProduceCommand(this.team, building.id, pick.id));
    }
  }

  private commandSquads(engine: WarEngine, player: WarPlayer): void {
    const enemy: WarTeam = this.team === 0 ? 1 : 0;
    const target = WarMapData.hq(enemy);
    const sign = WarMapData.sign(enemy);
    const lanes: WarPoint[] = [
      { x: -WarMapData.LANE_X, y: WarMapData.LANE_Y * sign },
      { x: 0, y: 0 },
      { x: WarMapData.LANE_X, y: WarMapData.LANE_Y * sign },
    ];
    for (const squad of player.squads) {
      const size = squad.members.length;
      if (squad.mode === "home" && size >= this.profile.attackSquadSize) {
        const lane = lanes[this.random.below(lanes.length)];
        engine.submit(new WarAttackPathCommand(this.team, squad.index, [lane, target]));
      } else if (squad.mode === "away" && size <= this.profile.retreatSquadSize && !squad.isEngaged()) {
        engine.submit(new WarRecallCommand(this.team, squad.index));
      }
    }
  }
}

class WarEasyBot extends WarBotBrain {
  constructor(team: WarTeam, seed: number) {
    super(team, seed, { thinkTicks: 40, oreWorkerTarget: 8, crystalWorkerTarget: 2, buildingTarget: 4, attackSquadSize: 18, retreatSquadSize: 3, buildOrder: ["barracks", "range", "barracks", "range"] });
  }
}

class WarNormalBot extends WarBotBrain {
  constructor(team: WarTeam, seed: number) {
    super(team, seed, { thinkTicks: 20, oreWorkerTarget: 12, crystalWorkerTarget: 5, buildingTarget: 7, attackSquadSize: 14, retreatSquadSize: 3, buildOrder: ["barracks", "range", "barracks", "lab", "range", "barracks", "lab"] });
  }
}

class WarHardBot extends WarBotBrain {
  constructor(team: WarTeam, seed: number) {
    super(team, seed, { thinkTicks: 10, oreWorkerTarget: 16, crystalWorkerTarget: 7, buildingTarget: 9, attackSquadSize: 11, retreatSquadSize: 4, buildOrder: ["barracks", "range", "lab", "barracks", "range", "lab", "barracks", "range", "lab"] });
  }
}

class WarBotFactory {
  static create(level: "easy" | "normal" | "hard", team: WarTeam, seed: number): WarBotBrain {
    if (level === "easy") return new WarEasyBot(team, seed);
    if (level === "hard") return new WarHardBot(team, seed);
    return new WarNormalBot(team, seed);
  }
}
