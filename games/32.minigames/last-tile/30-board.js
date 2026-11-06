"use strict";
class TileBoard {
    constructor(seed, startTime) {
        this.startTime = startTime;
        this.holes = [];
        this.stepTimes = [];
        this.suddenTimes = [];
        this.collapseTimes = [];
        const random = new SeededRandom(seed);
        const order = TileBoard.suddenDeathOrder();
        for (let floor = 0; floor < LastTileRules.FLOOR_COUNT; floor++) {
            this.holes[floor] = [];
            this.stepTimes[floor] = [];
            this.suddenTimes[floor] = [];
            this.collapseTimes[floor] = [];
            for (let index = 0; index < LastTileGeometry.tileCount(); index++) {
                this.holes[floor][index] = false;
                this.stepTimes[floor][index] = Infinity;
                this.suddenTimes[floor][index] = TileBoard.suddenTimeOf(floor, index, order, startTime);
                this.collapseTimes[floor][index] = this.collapseFor(floor, index);
            }
        }
        this.punchBottomHoles(random);
    }
    static inactive() {
        return new TileBoard(1, Infinity);
    }
    static suddenDeathOrder() {
        const order = [];
        for (let floor = LastTileRules.FLOOR_COUNT - 1; floor >= 0; floor--) {
            for (let ring = 0; ring < LastTileRules.GRID / 2; ring++)
                order.push([floor, ring]);
        }
        return order;
    }
    static suddenTimeOf(floor, index, order, startTime) {
        let position = -1;
        order.forEach((entry, at) => {
            if (entry[0] === floor && entry[1] === LastTileGeometry.ringOf(index))
                position = at;
        });
        if (!isFinite(startTime) || position < 0)
            return Infinity;
        return startTime + (LastTileRules.SUDDEN_START_S + position * LastTileRules.SUDDEN_STEP_S) * 1000;
    }
    punchBottomHoles(random) {
        const candidates = [];
        for (let index = 0; index < LastTileGeometry.tileCount(); index++)
            candidates.push(index);
        for (let count = 0; count < LastTileRules.BOTTOM_HOLES; count++) {
            const pick = Math.floor(random.next() * candidates.length);
            this.holes[0][candidates[pick]] = true;
            candidates.splice(pick, 1);
        }
    }
    collapseFor(floor, index) {
        const trigger = this.triggerTime(floor, index);
        return trigger === Infinity ? Infinity : trigger + LastTileGeometry.collapseDelayMs(floor);
    }
    startAt() {
        return this.startTime !== Infinity ? this.startTime : 0;
    }
    hasFloor(floor) {
        return !!this.stepTimes[floor];
    }
    isHole(floor, index) {
        return this.holes[floor][index];
    }
    stepTime(floor, index) {
        return this.stepTimes[floor][index];
    }
    suddenTime(floor, index) {
        return this.suddenTimes[floor][index];
    }
    triggerTime(floor, index) {
        return Math.min(this.stepTimes[floor][index], this.suddenTimes[floor][index]);
    }
    collapseTime(floor, index) {
        return this.collapseTimes[floor][index];
    }
    isUntouched(floor, index) {
        return this.stepTimes[floor][index] === Infinity;
    }
    isSolid(floor, index, t) {
        return index >= 0 && !this.holes[floor][index] && t < this.collapseTimes[floor][index];
    }
    isSolidAt(floor, x, z, t) {
        return this.isSolid(floor, LastTileGeometry.tileIndexAt(x, z), t);
    }
    recordStep(floor, index, t) {
        if (!this.isUntouched(floor, index))
            return false;
        this.stepTimes[floor][index] = t;
        this.collapseTimes[floor][index] = this.collapseFor(floor, index);
        return true;
    }
    acceptReportedStep(floor, index, t) {
        if (!this.hasFloor(floor) || isNaN(index) || index < 0 || index >= LastTileGeometry.tileCount() || !isFinite(t))
            return false;
        this.stepTimes[floor][index] = t;
        this.collapseTimes[floor][index] = this.collapseFor(floor, index);
        return true;
    }
    knownStepTime(floor, index) {
        return this.hasFloor(floor) ? this.stepTimes[floor][index] : null;
    }
}
