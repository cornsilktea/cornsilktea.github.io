class TileBoard {
  private readonly holes: boolean[][] = [];
  private readonly stepTimes: number[][] = [];
  private readonly suddenTimes: number[][] = [];
  private readonly collapseTimes: number[][] = [];

  constructor(seed: number, private readonly startTime: number) {
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

  static inactive(): TileBoard {
    return new TileBoard(1, Infinity);
  }

  private static suddenDeathOrder(): Array<[number, number]> {
    const order: Array<[number, number]> = [];
    for (let floor = LastTileRules.FLOOR_COUNT - 1; floor >= 0; floor--) {
      for (let ring = 0; ring < LastTileRules.GRID / 2; ring++) order.push([floor, ring]);
    }
    return order;
  }

  private static suddenTimeOf(floor: number, index: number, order: Array<[number, number]>, startTime: number): number {
    let position = -1;
    order.forEach((entry, at) => {
      if (entry[0] === floor && entry[1] === LastTileGeometry.ringOf(index)) position = at;
    });
    if (!isFinite(startTime) || position < 0) return Infinity;
    return startTime + (LastTileRules.SUDDEN_START_S + position * LastTileRules.SUDDEN_STEP_S) * 1000;
  }

  private punchBottomHoles(random: SeededRandom): void {
    const candidates: number[] = [];
    for (let index = 0; index < LastTileGeometry.tileCount(); index++) candidates.push(index);
    for (let count = 0; count < LastTileRules.BOTTOM_HOLES; count++) {
      const pick = Math.floor(random.next() * candidates.length);
      this.holes[0][candidates[pick]] = true;
      candidates.splice(pick, 1);
    }
  }

  private collapseFor(floor: number, index: number): number {
    const trigger = this.triggerTime(floor, index);
    return trigger === Infinity ? Infinity : trigger + LastTileGeometry.collapseDelayMs(floor);
  }

  startAt(): number {
    return this.startTime !== Infinity ? this.startTime : 0;
  }

  hasFloor(floor: number): boolean {
    return !!this.stepTimes[floor];
  }

  isHole(floor: number, index: number): boolean {
    return this.holes[floor][index];
  }

  stepTime(floor: number, index: number): number {
    return this.stepTimes[floor][index];
  }

  suddenTime(floor: number, index: number): number {
    return this.suddenTimes[floor][index];
  }

  triggerTime(floor: number, index: number): number {
    return Math.min(this.stepTimes[floor][index], this.suddenTimes[floor][index]);
  }

  collapseTime(floor: number, index: number): number {
    return this.collapseTimes[floor][index];
  }

  isUntouched(floor: number, index: number): boolean {
    return this.stepTimes[floor][index] === Infinity;
  }

  isSolid(floor: number, index: number, t: number): boolean {
    return index >= 0 && !this.holes[floor][index] && t < this.collapseTimes[floor][index];
  }

  isSolidAt(floor: number, x: number, z: number, t: number): boolean {
    return this.isSolid(floor, LastTileGeometry.tileIndexAt(x, z), t);
  }

  recordStep(floor: number, index: number, t: number): boolean {
    if (!this.isUntouched(floor, index)) return false;
    this.stepTimes[floor][index] = t;
    this.collapseTimes[floor][index] = this.collapseFor(floor, index);
    return true;
  }

  acceptReportedStep(floor: number, index: number, t: number): boolean {
    if (!this.hasFloor(floor) || isNaN(index) || index < 0 || index >= LastTileGeometry.tileCount() || !isFinite(t)) return false;
    this.stepTimes[floor][index] = t;
    this.collapseTimes[floor][index] = this.collapseFor(floor, index);
    return true;
  }

  knownStepTime(floor: number, index: number): number | null {
    return this.hasFloor(floor) ? this.stepTimes[floor][index] : null;
  }
}
