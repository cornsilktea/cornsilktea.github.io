interface WireStream {
  readonly name: string;
  readonly events: readonly FirebaseEvent[];
}

interface GameWire {
  writeMany(stream: string, values: Record<string, string>): void;
  push(stream: string, value: unknown): void;
  set(stream: string, key: string, value: unknown): void;
  claimEarliest(stream: string, key: string, value: number): void;
}

type WireHandler = (stream: string, key: string, value: unknown) => void;

interface ControlButton {
  readonly action: string;
  readonly label: string;
  readonly codes: readonly string[];
  readonly color: string;
  readonly rightPx: number;
  readonly bottomPx: number;
  readonly hold?: boolean;
  readonly wide?: boolean;
  readonly keyOnly?: boolean;
}

interface ControlSpec {
  readonly stick: boolean;
  readonly turnActions?: boolean;
  readonly buttons: readonly ControlButton[];
}

interface HudRow {
  readonly id: string;
  readonly nick: string;
  readonly slot: number;
  readonly ai: boolean;
  readonly dead: boolean;
  readonly detail: string;
  readonly progress?: number;
}

interface HudCooldown {
  readonly action: string;
  readonly label: string;
  readonly left: number;
}

interface ViewTarget {
  readonly id: string;
  readonly nick: string;
  readonly slot: number;
  readonly ai: boolean;
  readonly out: boolean;
}

interface HudModel {
  readonly rows: readonly HudRow[];
  readonly viewTargets: readonly ViewTarget[];
  readonly viewingId: string | null;
  readonly summary: string;
  readonly clock: string;
  readonly footer: string;
  readonly cooldowns: readonly HudCooldown[];
  readonly bannerHtml: string;
  readonly bannerWarning: boolean;
  readonly centerText: string;
  readonly spectateButton: boolean;
}

interface GameSetup {
  readonly seed: number;
  readonly startAt: number;
  readonly participants: readonly MatchParticipant[];
  readonly looks: ReadonlyMap<string, CharacterLook>;
}

interface CharacterSet {
  readonly assets: CharacterAssets;
  readonly factory: CharacterModelFactory;
}

interface MiniGameContext extends GameSetup {
  readonly localId: string;
  readonly clock: Clock;
  readonly wire: GameWire;
  readonly host: HostGate;
  readonly render: RenderHost;
  readonly movement: MovementSource;
  readonly libs: ThreeLibs;
  readonly page: Page;
  readonly env: BrowserEnv;
  readonly characters: CharacterSet;
}

interface KeyHelp {
  readonly keys: readonly string[];
  readonly text: string;
}

abstract class MiniGame {
  constructor(protected readonly context: MiniGameContext) {}

  abstract streams(): readonly WireStream[];
  abstract controls(): ControlSpec;
  abstract startAt(): number;
  abstract tick(dt: number, draw: boolean): void;
  abstract perform(action: string): void;
  abstract spectateNext(): void;
  spectateTo(id: string): void {
    return;
  }
  resultNotes(): Record<string, string> {
    return {};
  }
  abstract receive(stream: string, key: string, value: unknown): void;
  abstract playerDeparted(id: string): void;
  abstract isOver(): boolean;
  abstract ranking(): RankEntry[];
  abstract hud(now: number): HudModel;
  abstract conclude(): void;
  abstract dispose(): void;

  participants(): readonly MatchParticipant[] {
    return this.context.participants;
  }

  localParticipates(): boolean {
    return this.context.participants.some((participant) => participant.id === this.context.localId);
  }
}

interface BackdropContext {
  readonly libs: ThreeLibs;
  readonly env: BrowserEnv;
  readonly clock: Clock;
  readonly render: RenderHost;
}

abstract class GameBackdrop {
  abstract render(dt: number): void;
  abstract dispose(): void;
}

abstract class GameDefinition {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly summary: string;
  abstract readonly keyHelp: readonly KeyHelp[];
  abstract readonly rules: readonly string[];

  abstract preload(): Promise<void>;
  abstract create(context: MiniGameContext): MiniGame;
  abstract createBackdrop(context: BackdropContext): GameBackdrop;
}

class GameCatalog {
  constructor(private readonly definitions: readonly GameDefinition[]) {}

  all(): readonly GameDefinition[] {
    return this.definitions;
  }

  ids(): string[] {
    return this.definitions.map((definition) => definition.id);
  }

  find(id: string): GameDefinition | null {
    return this.definitions.find((definition) => definition.id === id) || null;
  }

  pickRandom(random: RandomSource): GameDefinition | null {
    if (this.definitions.length === 0) return null;
    return this.definitions[Math.min(this.definitions.length - 1, Math.floor(random.next() * this.definitions.length))];
  }

  preloadAll(): Promise<void> {
    return Promise.all(this.definitions.map((definition) => definition.preload())).then(() => undefined);
  }
}

class CollectionRules {
  static readonly ROOM_ROOT = "minigames/rooms";
  static readonly ROOM_CODE_LENGTH = 5;
  static readonly MAX_PLAYERS = 6;
  static readonly MAX_SPECTATORS = 1;
  static readonly MIN_PLAYERS = 2;
  static readonly MIN_FIELD_SIZE = 4;
  static readonly SPECTATOR_SLOT = 6;
  static readonly ROUNDS_PER_GAME = 1;
  static readonly COUNTDOWN_MS = 3000;
  static readonly COUNTDOWN_LEAD_MS = 500;
  static readonly RESULT_MS = 4500;
  static readonly STALE_EMPTY_ROOM_MS = 60000;
  static readonly STALE_OLD_ROOM_MS = 6 * 3600000;
  static readonly AI_NAMES: readonly string[] = ["코코", "모모", "보리", "두부", "별이", "구름"];
  static readonly AI_FALLBACK_NAME = "봇";
}

class PlanBuilder {
  static build(gameIds: readonly string[], roundsPerGame: number): string[] {
    const plan: string[] = [];
    gameIds.forEach((id) => {
      for (let round = 0; round < roundsPerGame; round++) plan.push(id);
    });
    return plan;
  }
}

class SpectatorCursor {
  private spectated: string | null = null;

  constructor(private readonly localId: string) {}

  reset(): void {
    this.spectated = null;
  }

  watched(): string | null {
    return this.spectated;
  }

  choose(alive: readonly string[]): string | null {
    if (alive.indexOf(this.localId) >= 0) return this.localId;
    if (this.spectated && alive.indexOf(this.spectated) >= 0) return this.spectated;
    if (alive.length) {
      this.spectated = alive[0];
      return alive[0];
    }
    return null;
  }

  select(id: string, alive: readonly string[]): void {
    if (alive.indexOf(id) >= 0) this.spectated = id;
  }

  cycle(alive: readonly string[]): void {
    const others = alive.filter((id) => id !== this.localId);
    if (!others.length) return;
    const at = this.spectated ? others.indexOf(this.spectated) : -1;
    this.spectated = others[(at + 1) % others.length];
  }
}
