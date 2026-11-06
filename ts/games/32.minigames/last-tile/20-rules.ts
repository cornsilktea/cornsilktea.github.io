class LastTileRules {
  static readonly FLOOR_COUNT = 3;
  static readonly GRID = 8;
  static readonly TILE = 2;
  static readonly TILE_SCALE = 0.95;
  static readonly HALF = LastTileRules.GRID * LastTileRules.TILE / 2;
  static readonly FLOOR_GAP = 4;
  static readonly COLLAPSE_TOP_S = 0.8;
  static readonly COLLAPSE_BOTTOM_S = 1.2;
  static readonly BOTTOM_HOLES = 0;
  static readonly GRAVITY = 24;
  static readonly DEATH_DEPTH = 10;
  static readonly MAX_SPEED = 6.2;
  static readonly ACCEL = 34;
  static readonly FRICTION = 20;
  static readonly PUSH_RANGE = 2.5;
  static readonly PUSH_HALF_ANGLE = 0.95;
  static readonly PUSH_IMPULSE = 10.5;
  static readonly PUSH_COOLDOWN_MS = 1000;
  static readonly PUSH_BLEND_RADIAL = 0.3;
  static readonly PUSH_MIN_SPREAD_DISTANCE = 0.8;
  static readonly PUSH_EVENT_MAX_AGE_MS = 3000;
  static readonly DASH_DISTANCE = 4;
  static readonly DASH_TIME_S = 0.18;
  static readonly DASH_COOLDOWN_MS = 1500;
  static readonly DASH_EXIT_SPEED = 9;
  static readonly DASH_SPEED = LastTileRules.DASH_DISTANCE / LastTileRules.DASH_TIME_S;
  static readonly LAND_KEEP = 0.55;
  static readonly COUNTDOWN_MS = 3000;
  static readonly COUNTDOWN_LEAD_MS = 500;
  static readonly SUDDEN_START_S = 35;
  static readonly SUDDEN_STEP_S = 4;
  static readonly RESULT_MS = 4500;
  static readonly ROUND_END_DELAY_MS = 800;
  static readonly END_CHECK_INTERVAL_MS = 250;
  static readonly TOTAL_ROUNDS = 3;
  static readonly MIN_PLAYERS = 2;
  static readonly MAX_PLAYERS = 6;
  static readonly NET_MS = 143;
  static readonly TIE_MS = 150;
  static readonly START_RING_RADIUS = 6.4;
  static readonly START_RING_PHASE = 0.4;
  static readonly BOARD_LIMIT = LastTileRules.HALF - 0.55;
  static readonly SPECTATE_CLAMP_MS = 2000;
  static readonly TILE_REQUEST_PAST_MS = 2000;
  static readonly TILE_REQUEST_FUTURE_MS = 300;
  static readonly STALE_EMPTY_ROOM_MS = 60000;
  static readonly STALE_OLD_ROOM_MS = 6 * 3600000;
  static readonly ROOM_ROOT = "lasttilev2/rooms";
  static readonly ROOM_CODE_LENGTH = 5;
  static readonly POINTS: readonly number[] = [5, 3, 2, 1, 1, 1];
  static readonly AI_NAMES: readonly string[] = ["코코", "모모", "보리", "두부", "별이", "구름"];
  static readonly AI_FALLBACK_NAME = "봇";
}

class AiTuning {
  static readonly REACT_MIN = 250;
  static readonly REACT_MAX = 400;
  static readonly THINK_MIN = 150;
  static readonly THINK_MAX = 250;
  static readonly PUSH_SUCCESS = 0.6;
  static readonly AIM_NOISE = 0.3;
  static readonly TARGET_NOISE = 0.9;
  static readonly SPEED_FACTOR = 0.85;
  static readonly IDLE_SPEED_FACTOR = 0.45;
  static readonly DANGER_MS = 700;
  static readonly SAFE_MS = 1200;
  static readonly DASH_APPROACH_CHANCE = 0.4;
  static readonly PUSH_REACH_FACTOR = 0.92;
  static readonly EDGE_PROBE_DISTANCE = 1.5;
  static readonly EDGE_PROBE_AHEAD_MS = 400;
  static readonly DASH_MIN_FOE_DISTANCE = 2.6;
  static readonly DASH_MAX_FOE_DISTANCE = 4.6;
  static readonly DASH_STOP_SHORT = 1.2;
  static readonly PATH_STEP = 0.4;
  static readonly TARGET_MAX_DISTANCE = 9;
  static readonly CENTER_PULL = 0.35;
  static readonly FRESH_BONUS = -1.4;
  static readonly WORN_PENALTY = 1.5;
  static readonly STAY_PENALTY = 3;
  static readonly FALLBACK_SAFE_MS = 400;
  static readonly RESCUE_DASH_DELAY_MS = 60;
  static readonly RESCUE_DASH_MIN = 2.2;
  static readonly ARRIVE_DISTANCE = 0.3;
  static readonly SLOW_DOWN_DISTANCE = 1;
  static readonly NO_FOE_DISTANCE = 99;
  static readonly WORST_SCORE = 1e9;
}

class ScoreTable {
  static pointsFor(rank: number): number {
    return LastTileRules.POINTS[Math.min(rank, LastTileRules.POINTS.length) - 1] || 1;
  }
}

class LastTileGeometry {
  static floorY(floor: number): number {
    return floor * LastTileRules.FLOOR_GAP;
  }

  static tileIndexAt(x: number, z: number): number {
    const half = LastTileRules.HALF, tile = LastTileRules.TILE, grid = LastTileRules.GRID;
    const ix = Math.floor((x + half) / tile), iz = Math.floor((z + half) / tile);
    if (ix < 0 || iz < 0 || ix >= grid || iz >= grid) return -1;
    return iz * grid + ix;
  }

  static tileCenter(index: number): { x: number; z: number } {
    const grid = LastTileRules.GRID, tile = LastTileRules.TILE, half = LastTileRules.HALF;
    return { x: (index % grid) * tile - half + tile / 2, z: Math.floor(index / grid) * tile - half + tile / 2 };
  }

  static ringOf(index: number): number {
    const grid = LastTileRules.GRID;
    const ix = index % grid, iz = Math.floor(index / grid);
    return Math.min(ix, iz, grid - 1 - ix, grid - 1 - iz);
  }

  static collapseDelayMs(floor: number): number {
    const count = LastTileRules.FLOOR_COUNT;
    const share = (count - 1 - floor) / Math.max(1, count - 1);
    return (LastTileRules.COLLAPSE_TOP_S + share * (LastTileRules.COLLAPSE_BOTTOM_S - LastTileRules.COLLAPSE_TOP_S)) * 1000;
  }

  static startPosition(index: number, count: number): { x: number; z: number } {
    const angle = index / count * Math.PI * 2 + LastTileRules.START_RING_PHASE;
    return { x: Math.cos(angle) * LastTileRules.START_RING_RADIUS, z: Math.sin(angle) * LastTileRules.START_RING_RADIUS };
  }

  static tileCount(): number {
    return LastTileRules.GRID * LastTileRules.GRID;
  }
}
