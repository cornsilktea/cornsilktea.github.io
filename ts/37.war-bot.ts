interface WarBotProfile {
  thinkTicks: number;
  oreWorkerTarget: number;
  crystalWorkerTarget: number;
  buildingTarget: number;
  launchArmyPop: number;
  minSquadToSend: number;
  retreatSquadSize: number;
  queueDepth: number;
  defends: boolean;
  buildOrder: WarBuildingType[];
}

abstract class WarBotBrain {
  private static readonly SAVE_FOR_BUILDING_ORE = 150;
  private static readonly RETREAT_PATIENCE_TICKS = 60;
  private static readonly THREAT_RADIUS = 4200;
  private static readonly FIGHTERS_PER_SUPPORT = 5;
  private readonly weakSince = new Map<number, number>();
  private readonly random: WarRandom;
  private readonly turns = new Map<number, number>();

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

  private baseThreatened(engine: WarEngine): boolean {
    const hq = WarMapData.hq(this.team);
    const limitSq = WarBotBrain.THREAT_RADIUS * WarBotBrain.THREAT_RADIUS;
    for (const entity of engine.entitiesOf(this.team === 0 ? 1 : 0)) {
      if (!(entity instanceof WarUnit)) continue;
      const dx = entity.x - hq.x;
      const dy = entity.y - hq.y;
      if (dx * dx + dy * dy <= limitSq && engine.vision.isVisible(this.team, entity.x, entity.y)) return true;
    }
    return false;
  }

  private pullBackIdleSquads(engine: WarEngine, player: WarPlayer): void {
    for (const squad of player.squads) {
      if (squad.mode === "away" && !squad.isEngaged()) engine.submit(new WarRecallCommand(this.team, squad.index));
    }
  }

  private wantsNextBuilding(player: WarPlayer): boolean {
    const built = player.buildings().filter((b) => b.def.type !== "hq").length;
    return built < this.profile.buildingTarget && player.slotBuildings.some((b, i) => !b && player.slotDefs[i].enabled);
  }

  private trainUnits(engine: WarEngine, player: WarPlayer): void {
    if (this.wantsNextBuilding(player) && player.economy.ore < WarBotBrain.SAVE_FOR_BUILDING_ORE) return;
    const factories = player.buildings().filter((b) => b.def.type !== "hq" && b.complete && b.queue.length < this.profile.queueDepth);
    factories.sort((a, b) => b.def.crystal - a.def.crystal);
    const economy = player.economy;
    let ore = economy.ore;
    let crystal = economy.crystal;
    for (const building of factories) {
      const choices = this.affordableKinds(engine, player, WarUnitCatalog.producedBy(player.faction, building.def.type)).filter((def) => def.crystal <= crystal);
      if (choices.length === 0) continue;
      const turn = this.turns.get(building.id) ?? 0;
      const pick = choices[turn % choices.length];
      if (pick.ore > ore) {
        if (pick.crystal > 0) return;
        continue;
      }
      this.turns.set(building.id, turn + 1);
      ore -= pick.ore;
      crystal -= pick.crystal;
      engine.submit(new WarProduceCommand(this.team, building.id, pick.id));
    }
  }

  private affordableKinds(engine: WarEngine, player: WarPlayer, choices: WarUnitDef[]): WarUnitDef[] {
    const mine = engine.units(this.team);
    const supports = mine.filter((unit) => unit.def.damage <= 0).length;
    const fighters = mine.length - supports;
    const allowed = choices.filter((def) => def.damage > 0 || supports * WarBotBrain.FIGHTERS_PER_SUPPORT < fighters);
    return allowed.length > 0 ? allowed : choices;
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
    const threatened = this.profile.defends && this.baseThreatened(engine);
    const ready = player.squads.filter((squad) => squad.mode === "home" && squad.members.length >= this.profile.minSquadToSend);
    const readyPop = ready.reduce((sum, squad) => sum + squad.members.reduce((inner, unit) => inner + unit.def.pop, 0), 0);
    if (readyPop >= this.profile.launchArmyPop && !threatened) {
      const lane = lanes[this.random.below(lanes.length)];
      for (const squad of ready) engine.submit(new WarAttackPathCommand(this.team, squad.index, [lane, target]));
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

class WarEasyBot extends WarBotBrain {
  constructor(team: WarTeam, seed: number) {
    super(team, seed, { thinkTicks: 40, oreWorkerTarget: 4, crystalWorkerTarget: 1, buildingTarget: 4, launchArmyPop: 28, minSquadToSend: 8, retreatSquadSize: 3, queueDepth: 2, defends: false, buildOrder: ["barracks", "barracks", "citadel", "citadel"] });
  }
}

class WarNormalBot extends WarBotBrain {
  constructor(team: WarTeam, seed: number) {
    super(team, seed, { thinkTicks: 20, oreWorkerTarget: 5, crystalWorkerTarget: 3, buildingTarget: 4, launchArmyPop: 24, minSquadToSend: 6, retreatSquadSize: 3, queueDepth: 2, defends: false, buildOrder: ["barracks", "citadel", "barracks", "citadel"] });
  }
}

class WarHardBot extends WarBotBrain {
  constructor(team: WarTeam, seed: number) {
    super(team, seed, { thinkTicks: 10, oreWorkerTarget: 5, crystalWorkerTarget: 3, buildingTarget: 4, launchArmyPop: 24, minSquadToSend: 6, retreatSquadSize: 3, queueDepth: 3, defends: true, buildOrder: ["barracks", "citadel", "barracks", "citadel"] });
  }
}

class WarBotFactory {
  static create(level: "easy" | "normal" | "hard", team: WarTeam, seed: number): WarBotBrain {
    if (level === "easy") return new WarEasyBot(team, seed);
    if (level === "hard") return new WarHardBot(team, seed);
    return new WarNormalBot(team, seed);
  }
}
