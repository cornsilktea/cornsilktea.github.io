"use strict";
class LastTileRules {
}
LastTileRules.FLOOR_COUNT = 3;
LastTileRules.GRID = 8;
LastTileRules.TILE = 2;
LastTileRules.TILE_SCALE = 0.95;
LastTileRules.HALF = LastTileRules.GRID * LastTileRules.TILE / 2;
LastTileRules.FLOOR_GAP = 4;
LastTileRules.COLLAPSE_TOP_S = 0.8;
LastTileRules.COLLAPSE_BOTTOM_S = 1.2;
LastTileRules.BOTTOM_HOLES = 0;
LastTileRules.GRAVITY = 24;
LastTileRules.DEATH_DEPTH = 10;
LastTileRules.MAX_SPEED = 6.2;
LastTileRules.ACCEL = 34;
LastTileRules.FRICTION = 20;
LastTileRules.PUSH_RANGE = 2.5;
LastTileRules.PUSH_HALF_ANGLE = 0.95;
LastTileRules.PUSH_IMPULSE = 10.5;
LastTileRules.PUSH_COOLDOWN_MS = 1000;
LastTileRules.PUSH_BLEND_RADIAL = 0.3;
LastTileRules.PUSH_MIN_SPREAD_DISTANCE = 0.8;
LastTileRules.PUSH_EVENT_MAX_AGE_MS = 3000;
LastTileRules.DASH_DISTANCE = 4;
LastTileRules.DASH_TIME_S = 0.18;
LastTileRules.DASH_COOLDOWN_MS = 1500;
LastTileRules.DASH_EXIT_SPEED = 9;
LastTileRules.DASH_SPEED = LastTileRules.DASH_DISTANCE / LastTileRules.DASH_TIME_S;
LastTileRules.LAND_KEEP = 0.55;
LastTileRules.COUNTDOWN_MS = 3000;
LastTileRules.COUNTDOWN_LEAD_MS = 500;
LastTileRules.SUDDEN_START_S = 35;
LastTileRules.SUDDEN_STEP_S = 4;
LastTileRules.RESULT_MS = 4500;
LastTileRules.ROUND_END_DELAY_MS = 800;
LastTileRules.END_CHECK_INTERVAL_MS = 250;
LastTileRules.TOTAL_ROUNDS = 3;
LastTileRules.MIN_PLAYERS = 2;
LastTileRules.MAX_PLAYERS = 6;
LastTileRules.NET_MS = 143;
LastTileRules.TIE_MS = 150;
LastTileRules.START_RING_RADIUS = 6.4;
LastTileRules.START_RING_PHASE = 0.4;
LastTileRules.BOARD_LIMIT = LastTileRules.HALF - 0.55;
LastTileRules.SPECTATE_CLAMP_MS = 2000;
LastTileRules.TILE_REQUEST_PAST_MS = 2000;
LastTileRules.TILE_REQUEST_FUTURE_MS = 300;
LastTileRules.STALE_EMPTY_ROOM_MS = 60000;
LastTileRules.STALE_OLD_ROOM_MS = 6 * 3600000;
LastTileRules.ROOM_ROOT = "lasttilev2/rooms";
LastTileRules.ROOM_CODE_LENGTH = 5;
LastTileRules.POINTS = [5, 3, 2, 1, 1, 1];
LastTileRules.AI_NAMES = ["코코", "모모", "보리", "두부", "별이", "구름"];
LastTileRules.AI_FALLBACK_NAME = "봇";
class AiTuning {
}
AiTuning.REACT_MIN = 250;
AiTuning.REACT_MAX = 400;
AiTuning.THINK_MIN = 150;
AiTuning.THINK_MAX = 250;
AiTuning.PUSH_SUCCESS = 0.6;
AiTuning.AIM_NOISE = 0.3;
AiTuning.TARGET_NOISE = 0.9;
AiTuning.SPEED_FACTOR = 0.85;
AiTuning.IDLE_SPEED_FACTOR = 0.45;
AiTuning.DANGER_MS = 700;
AiTuning.SAFE_MS = 1200;
AiTuning.DASH_APPROACH_CHANCE = 0.4;
AiTuning.PUSH_REACH_FACTOR = 0.92;
AiTuning.EDGE_PROBE_DISTANCE = 1.5;
AiTuning.EDGE_PROBE_AHEAD_MS = 400;
AiTuning.DASH_MIN_FOE_DISTANCE = 2.6;
AiTuning.DASH_MAX_FOE_DISTANCE = 4.6;
AiTuning.DASH_STOP_SHORT = 1.2;
AiTuning.PATH_STEP = 0.4;
AiTuning.TARGET_MAX_DISTANCE = 9;
AiTuning.CENTER_PULL = 0.35;
AiTuning.FRESH_BONUS = -1.4;
AiTuning.WORN_PENALTY = 1.5;
AiTuning.STAY_PENALTY = 3;
AiTuning.FALLBACK_SAFE_MS = 400;
AiTuning.RESCUE_DASH_DELAY_MS = 60;
AiTuning.RESCUE_DASH_MIN = 2.2;
AiTuning.ARRIVE_DISTANCE = 0.3;
AiTuning.SLOW_DOWN_DISTANCE = 1;
AiTuning.NO_FOE_DISTANCE = 99;
AiTuning.WORST_SCORE = 1e9;
class ScoreTable {
    static pointsFor(rank) {
        return LastTileRules.POINTS[Math.min(rank, LastTileRules.POINTS.length) - 1] || 1;
    }
}
class LastTileGeometry {
    static floorY(floor) {
        return floor * LastTileRules.FLOOR_GAP;
    }
    static tileIndexAt(x, z) {
        const half = LastTileRules.HALF, tile = LastTileRules.TILE, grid = LastTileRules.GRID;
        const ix = Math.floor((x + half) / tile), iz = Math.floor((z + half) / tile);
        if (ix < 0 || iz < 0 || ix >= grid || iz >= grid)
            return -1;
        return iz * grid + ix;
    }
    static tileCenter(index) {
        const grid = LastTileRules.GRID, tile = LastTileRules.TILE, half = LastTileRules.HALF;
        return { x: (index % grid) * tile - half + tile / 2, z: Math.floor(index / grid) * tile - half + tile / 2 };
    }
    static ringOf(index) {
        const grid = LastTileRules.GRID;
        const ix = index % grid, iz = Math.floor(index / grid);
        return Math.min(ix, iz, grid - 1 - ix, grid - 1 - iz);
    }
    static collapseDelayMs(floor) {
        const count = LastTileRules.FLOOR_COUNT;
        const share = (count - 1 - floor) / Math.max(1, count - 1);
        return (LastTileRules.COLLAPSE_TOP_S + share * (LastTileRules.COLLAPSE_BOTTOM_S - LastTileRules.COLLAPSE_TOP_S)) * 1000;
    }
    static startPosition(index, count) {
        const angle = index / count * Math.PI * 2 + LastTileRules.START_RING_PHASE;
        return { x: Math.cos(angle) * LastTileRules.START_RING_RADIUS, z: Math.sin(angle) * LastTileRules.START_RING_RADIUS };
    }
    static tileCount() {
        return LastTileRules.GRID * LastTileRules.GRID;
    }
}
