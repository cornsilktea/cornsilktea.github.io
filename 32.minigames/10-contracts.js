"use strict";
class MiniGame {
    constructor(context) {
        this.context = context;
    }
    participants() {
        return this.context.participants;
    }
    localParticipates() {
        return this.context.participants.some((participant) => participant.id === this.context.localId);
    }
}
class GameBackdrop {
}
class GameDefinition {
}
class GameCatalog {
    constructor(definitions) {
        this.definitions = definitions;
    }
    all() {
        return this.definitions;
    }
    ids() {
        return this.definitions.map((definition) => definition.id);
    }
    find(id) {
        return this.definitions.find((definition) => definition.id === id) || null;
    }
    pickRandom(random) {
        if (this.definitions.length === 0)
            return null;
        return this.definitions[Math.min(this.definitions.length - 1, Math.floor(random.next() * this.definitions.length))];
    }
    preloadAll() {
        return Promise.all(this.definitions.map((definition) => definition.preload())).then(() => undefined);
    }
}
class CollectionRules {
}
CollectionRules.ROOM_ROOT = "minigames/rooms";
CollectionRules.ROOM_CODE_LENGTH = 5;
CollectionRules.MAX_PLAYERS = 6;
CollectionRules.MIN_PLAYERS = 2;
CollectionRules.ROUNDS_PER_GAME = 1;
CollectionRules.COUNTDOWN_MS = 3000;
CollectionRules.COUNTDOWN_LEAD_MS = 500;
CollectionRules.RESULT_MS = 4500;
CollectionRules.STALE_EMPTY_ROOM_MS = 60000;
CollectionRules.STALE_OLD_ROOM_MS = 6 * 3600000;
CollectionRules.AI_NAMES = ["코코", "모모", "보리", "두부", "별이", "구름"];
CollectionRules.AI_FALLBACK_NAME = "봇";
class PlanBuilder {
    static build(gameIds, roundsPerGame) {
        const plan = [];
        gameIds.forEach((id) => {
            for (let round = 0; round < roundsPerGame; round++)
                plan.push(id);
        });
        return plan;
    }
}
class SpectatorCursor {
    constructor(localId) {
        this.localId = localId;
        this.spectated = null;
    }
    reset() {
        this.spectated = null;
    }
    watched() {
        return this.spectated;
    }
    choose(alive) {
        if (alive.indexOf(this.localId) >= 0)
            return this.localId;
        if (this.spectated && alive.indexOf(this.spectated) >= 0)
            return this.spectated;
        if (alive.length) {
            this.spectated = alive[0];
            return alive[0];
        }
        return null;
    }
    cycle(alive) {
        const others = alive.filter((id) => id !== this.localId);
        if (!others.length)
            return;
        const at = this.spectated ? others.indexOf(this.spectated) : -1;
        this.spectated = others[(at + 1) % others.length];
    }
}
