type Role = "hero" | "spy";
type TaskKind = "hold" | "sequence" | "timing";
type Winner = "hero" | "spy";
type MeetingPhase = "none" | "talk" | "vote" | "result";

interface CellPoint { x: number; y: number }
interface WorldPoint { x: number; z: number }

interface TaskSpotDefinition { x: number; y: number; roomName: string; title: string; kind: TaskKind }
interface MapPropDefinition { model: string; x: number; y: number; footprint: number; height: number }
interface MapDefinition {
  id: string;
  name: string;
  cellSize: number;
  rows: string[];
  floorColors: Record<string, string>;
  roomNames: Record<string, string>;
  tasks: TaskSpotDefinition[];
  table: CellPoint;
  props: MapPropDefinition[];
}

interface PlayerRecord {
  nick: string;
  isBot: boolean;
  joinedAt: number;
  slot: number;
  look: CharacterLook;
}

interface MatchRecord { id: number; startAt: number; mapId: string; order: string[] }
interface TaskProgress { done: number; total: number }
interface DeadRecord { t: number; x: number; z: number; n: number; left?: number }
interface MeetingRecord { n: number; kind: "report" | "button"; caller: string; body: string | null; at: number }
interface ResultRecord { n: number; ejected: string | null; wasSpy: boolean; at: number; counts: Record<string, number> }
interface EndRecord { winner: Winner; reason: string; at: number; spies: string[] }

interface TallyResult { ejected: string | null; counts: Record<string, number> }

class CastleSpyConfig {
  static readonly ROOT = "castlespy/rooms";
  static readonly MAX_PLAYERS = 6;
  static readonly MIN_PLAYERS = 4;
  static readonly TASKS_PER_PLAYER = 3;
  static readonly MOVE_SPEED = 5.4;
  static readonly PLAYER_RADIUS = 0.5;
  static readonly KILL_RANGE = 2.8;
  static readonly REPORT_RANGE = 3.8;
  static readonly TASK_RANGE = 2.4;
  static readonly TABLE_RANGE = 3.4;
  static readonly VISION_RADIUS = 10;
  static readonly FIRST_KILL_DELAY_MS = 12000;
  static readonly KILL_COOLDOWN_MS = 20000;
  static readonly EMERGENCY_UNLOCK_MS = 20000;
  static readonly ROLE_REVEAL_MS = 4500;
  static readonly TALK_MS = 30000;
  static readonly VOTE_MS = 20000;
  static readonly RESULT_MS = 6000;
  static readonly NET_MS = 143;
  static readonly VOTE_SKIP = "skip";
  static readonly SLOT_COLORS: readonly string[] = ["#E5484D", "#3E8EF0", "#3FB56B", "#F0C22E", "#B060E0", "#F08AB0"];
  static readonly BOT_NAMES: readonly string[] = ["코코", "모모", "보리", "두부", "별이", "구름"];
  static readonly MODEL_DIRECTORY = "assets/kaykit/";
}

class Mathx {
  static clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value;
  }

  static lerp(from: number, to: number, ratio: number): number {
    return from + (to - from) * ratio;
  }

  static angleDifference(a: number, b: number): number {
    let difference = a - b;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return difference;
  }

  static distance(ax: number, az: number, bx: number, bz: number): number {
    return Math.hypot(ax - bx, az - bz);
  }

  static round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  static seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  static shuffled<T>(items: readonly T[], random: () => number): T[] {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      const keep = copy[index];
      copy[index] = copy[other];
      copy[other] = keep;
    }
    return copy;
  }
}

class Dom {
  static byId<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
  }

  static show(element: HTMLElement, visible: boolean): void {
    element.hidden = !visible;
  }

  static setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) element.textContent = text;
  }

  static escape(text: string): string {
    const table: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return String(text).replace(/[&<>"]/g, (character) => table[character]);
  }
}

class CastleMapData {
  static readonly CASTLE_YARD: MapDefinition = {
    id: "castle",
    name: "성 안뜰",
    cellSize: 2,
    rows: [
      "##############################",
      "#aaaaaaaa#bbbbbbbbbb#cccccccc#",
      "#aaaaaaaa#bbbbbbbbbb#cccccccc#",
      "#aaa##aaa.bbbb##bbbb.cccccccc#",
      "#aaaaaaaa.bbbbbbbbbb.cccccccc#",
      "#aaaaaaaa#bbbbbbbbbb#cccccccc#",
      "#aaaaaaaa#bbbbbbbbbb#cccccccc#",
      "####..########..########..####",
      "#.........pppppppppp.........#",
      "#....#....pppppppppp....#....#",
      "#.........pppppppppp.........#",
      "#.........pppppppppp.........#",
      "####..########..########..####",
      "#dddddddd#eeeeeeeeee#ffffffff#",
      "#dddddddd#eeeeeeeeee#ffffffff#",
      "#dddddddd.eeeeeeeeee.ffffffff#",
      "#ddd##ddd.eeee##eeee.ffffffff#",
      "#dddddddd#eeeeeeeeee#ffffffff#",
      "#dddddddd#eeeeeeeeee#ffffffff#",
      "##############################"
    ],
    floorColors: { a: "#B98A5E", b: "#8F8F9A", c: "#C9A24E", d: "#7FA05E", e: "#C97B62", f: "#6D93B8", p: "#BDB5A2", ".": "#A39C8C" },
    roomNames: { a: "병영", b: "대장간", c: "시장", d: "마구간", e: "부엌", f: "감시탑", p: "광장", ".": "복도" },
    tasks: [
      { x: 2.5, y: 1.5, roomName: "병영", title: "검 닦기", kind: "hold" },
      { x: 7.5, y: 5.5, roomName: "병영", title: "갑옷 정리", kind: "sequence" },
      { x: 11.5, y: 5.5, roomName: "대장간", title: "쇠 두드리기", kind: "timing" },
      { x: 18.5, y: 1.5, roomName: "대장간", title: "불 지피기", kind: "hold" },
      { x: 22.5, y: 5.5, roomName: "시장", title: "물건 세기", kind: "sequence" },
      { x: 27.5, y: 1.5, roomName: "시장", title: "가격표 달기", kind: "timing" },
      { x: 2.5, y: 17.5, roomName: "마구간", title: "말 먹이 주기", kind: "hold" },
      { x: 7.5, y: 13.5, roomName: "마구간", title: "건초 옮기기", kind: "timing" },
      { x: 11.5, y: 13.5, roomName: "부엌", title: "수프 젓기", kind: "timing" },
      { x: 18.5, y: 17.5, roomName: "부엌", title: "빵 굽기", kind: "sequence" },
      { x: 22.5, y: 13.5, roomName: "감시탑", title: "횃불 켜기", kind: "hold" },
      { x: 27.5, y: 17.5, roomName: "감시탑", title: "망원경 맞추기", kind: "timing" }
    ],
    table: { x: 15, y: 10 },
    props: [
      { model: "barracks", x: 4.5, y: 3.5, footprint: 1.9, height: 2.2 },
      { model: "house", x: 5.5, y: 3.5, footprint: 1.9, height: 2.2 },
      { model: "mine", x: 14.5, y: 3.5, footprint: 1.9, height: 2.2 },
      { model: "lumbermill", x: 15.5, y: 3.5, footprint: 1.9, height: 2.2 },
      { model: "market", x: 4.5, y: 16.5, footprint: 1.9, height: 2.2 },
      { model: "watermill", x: 5.5, y: 16.5, footprint: 1.9, height: 2.2 },
      { model: "mill", x: 14.5, y: 16.5, footprint: 1.9, height: 2.4 },
      { model: "well", x: 15.5, y: 16.5, footprint: 1.6, height: 1.6 },
      { model: "watchtower", x: 5.5, y: 9.5, footprint: 1.8, height: 3.4 },
      { model: "detail_treeA", x: 24.5, y: 9.5, footprint: 1.8, height: 3.4 }
    ]
  };
}

class MapCatalog {
  static readonly ALL: readonly MapDefinition[] = [CastleMapData.CASTLE_YARD];

  static byId(id: string): MapDefinition {
    return MapCatalog.ALL.filter((definition) => definition.id === id)[0] || MapCatalog.ALL[0];
  }
}

class GameMap {
  readonly columns: number;
  readonly rowCount: number;
  readonly cell: number;

  constructor(readonly definition: MapDefinition) {
    this.rowCount = definition.rows.length;
    this.columns = definition.rows[0].length;
    this.cell = definition.cellSize;
  }

  cellChar(column: number, row: number): string {
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rowCount) return "#";
    return this.definition.rows[row].charAt(column);
  }

  isWallCell(column: number, row: number): boolean {
    return this.cellChar(column, row) === "#";
  }

  worldX(cellX: number): number {
    return (cellX - this.columns / 2) * this.cell;
  }

  worldZ(cellY: number): number {
    return (cellY - this.rowCount / 2) * this.cell;
  }

  cellOfX(x: number): number {
    return Math.floor(x / this.cell + this.columns / 2);
  }

  cellOfZ(z: number): number {
    return Math.floor(z / this.cell + this.rowCount / 2);
  }

  cellCenter(column: number, row: number): WorldPoint {
    return { x: this.worldX(column + 0.5), z: this.worldZ(row + 0.5) };
  }

  roomNameAt(x: number, z: number): string {
    return this.definition.roomNames[this.cellChar(this.cellOfX(x), this.cellOfZ(z))] || "";
  }

  floorColorAt(column: number, row: number): string | null {
    const character = this.cellChar(column, row);
    return character === "#" ? null : this.definition.floorColors[character] || "#A39C8C";
  }

  tablePosition(): WorldPoint {
    return { x: this.worldX(this.definition.table.x), z: this.worldZ(this.definition.table.y) };
  }

  taskPosition(taskIndex: number): WorldPoint {
    const spot = this.definition.tasks[taskIndex];
    return { x: this.worldX(spot.x), z: this.worldZ(spot.y) };
  }

  spawnPoint(index: number, count: number): WorldPoint {
    const table = this.tablePosition();
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + 0.4;
    return { x: table.x + Math.cos(angle) * 3.4, z: table.z + Math.sin(angle) * 3.4 };
  }

  circleHitsWall(x: number, z: number, radius: number): boolean {
    const firstColumn = this.cellOfX(x - radius), lastColumn = this.cellOfX(x + radius);
    const firstRow = this.cellOfZ(z - radius), lastRow = this.cellOfZ(z + radius);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        if (!this.isWallCell(column, row)) continue;
        const nearestX = Mathx.clamp(x, this.worldX(column), this.worldX(column + 1));
        const nearestZ = Mathx.clamp(z, this.worldZ(row), this.worldZ(row + 1));
        if (Mathx.distance(x, z, nearestX, nearestZ) < radius) return true;
      }
    }
    return false;
  }

  move(x: number, z: number, deltaX: number, deltaZ: number, radius: number): WorldPoint {
    let nextX = x, nextZ = z;
    if (!this.circleHitsWall(x + deltaX, z, radius)) nextX = x + deltaX;
    if (!this.circleHitsWall(nextX, z + deltaZ, radius)) nextZ = z + deltaZ;
    return { x: nextX, z: nextZ };
  }

  hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const distance = Mathx.distance(ax, az, bx, bz);
    const steps = Math.max(1, Math.ceil(distance / (this.cell * 0.4)));
    for (let step = 1; step < steps; step++) {
      const ratio = step / steps;
      if (this.isWallCell(this.cellOfX(Mathx.lerp(ax, bx, ratio)), this.cellOfZ(Mathx.lerp(az, bz, ratio)))) return false;
    }
    return true;
  }

  findPath(from: WorldPoint, to: WorldPoint): WorldPoint[] {
    const startColumn = this.cellOfX(from.x), startRow = this.cellOfZ(from.z);
    const goalColumn = this.cellOfX(to.x), goalRow = this.cellOfZ(to.z);
    const startKey = startRow * this.columns + startColumn, goalKey = goalRow * this.columns + goalColumn;
    const cameFrom = new Map<number, number>([[startKey, -1]]);
    const queue = [startKey];
    const steps: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let head = 0; head < queue.length && !cameFrom.has(goalKey); head++) {
      const key = queue[head];
      const column = key % this.columns, row = Math.floor(key / this.columns);
      steps.forEach(([stepColumn, stepRow]) => {
        const nextColumn = column + stepColumn, nextRow = row + stepRow;
        const nextKey = nextRow * this.columns + nextColumn;
        if (this.isWallCell(nextColumn, nextRow) || cameFrom.has(nextKey)) return;
        cameFrom.set(nextKey, key);
        queue.push(nextKey);
      });
    }
    if (!cameFrom.has(goalKey)) return [];
    const path: WorldPoint[] = [];
    for (let key = goalKey; key !== startKey && key !== undefined; key = cameFrom.get(key) as number) {
      path.push(this.cellCenter(key % this.columns, Math.floor(key / this.columns)));
    }
    path.reverse();
    path.push(to);
    return path;
  }

  reachableCellCount(): number {
    const spawn = this.tablePosition();
    const startKey = this.cellOfZ(spawn.z) * this.columns + this.cellOfX(spawn.x);
    const seen = new Set<number>([startKey]);
    const queue = [startKey];
    for (let head = 0; head < queue.length; head++) {
      const column = queue[head] % this.columns, row = Math.floor(queue[head] / this.columns);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([stepColumn, stepRow]) => {
        const nextKey = (row + stepRow) * this.columns + column + stepColumn;
        if (this.isWallCell(column + stepColumn, row + stepRow) || seen.has(nextKey)) return;
        seen.add(nextKey);
        queue.push(nextKey);
      });
    }
    return seen.size;
  }

  walkableCellCount(): number {
    let count = 0;
    for (let row = 0; row < this.rowCount; row++) {
      for (let column = 0; column < this.columns; column++) if (!this.isWallCell(column, row)) count++;
    }
    return count;
  }
}

class MatchRules {
  static assignRoles(playerIds: readonly string[], random: () => number): Record<string, Role> {
    const spyId = Mathx.shuffled(playerIds, random)[0];
    const roles: Record<string, Role> = {};
    playerIds.forEach((id) => { roles[id] = id === spyId ? "spy" : "hero"; });
    return roles;
  }

  static assignTasks(playerIds: readonly string[], taskCount: number, perPlayer: number, random: () => number): Record<string, number[]> {
    const assignment: Record<string, number[]> = {};
    let bag: number[] = [];
    playerIds.forEach((id) => {
      const chosen: number[] = [];
      while (chosen.length < perPlayer) {
        if (!bag.length) bag = Mathx.shuffled(Array.from({ length: taskCount }, (_, index) => index), random);
        const candidate = bag.pop() as number;
        if (chosen.indexOf(candidate) < 0) chosen.push(candidate);
      }
      assignment[id] = chosen;
    });
    return assignment;
  }

  static tally(votes: Record<string, string>, aliveIds: readonly string[]): TallyResult {
    const counts: Record<string, number> = {};
    aliveIds.forEach((voterId) => {
      const target = votes[voterId];
      if (target) counts[target] = (counts[target] || 0) + 1;
    });
    let best = 0, ejected: string | null = null, tie = false;
    Object.keys(counts).forEach((target) => {
      if (target === CastleSpyConfig.VOTE_SKIP) return;
      if (counts[target] > best) { best = counts[target]; ejected = target; tie = false; }
      else if (counts[target] === best) tie = true;
    });
    const skipCount = counts[CastleSpyConfig.VOTE_SKIP] || 0;
    if (tie || best <= skipCount || best === 0) ejected = null;
    return { ejected, counts };
  }

  static winner(aliveHeroes: number, aliveSpies: number, tasksDone: number, tasksTotal: number): { winner: Winner; reason: string } | null {
    if (aliveSpies <= 0) return { winner: "hero", reason: "스파이를 모두 찾아냈어요!" };
    if (aliveSpies >= aliveHeroes) return { winner: "spy", reason: "스파이가 살아남은 용사보다 많아졌어요!" };
    if (tasksTotal > 0 && tasksDone >= tasksTotal) return { winner: "hero", reason: "모든 할 일을 끝냈어요!" };
    return null;
  }
}

class SceneryAssets {
  static readonly DECOR_MODELS: readonly string[] = ["detail_treeA", "detail_treeB", "detail_treeC", "detail_rocks", "detail_rocks_small", "detail_hill", "detail_forestA"];

  tileGeometry: TileGeometry | null = null;
  private readonly props = new Map<string, Three<"Object3D">>();

  constructor(private readonly libs: ThreeLibs) {}

  async load(modelNames: readonly string[]): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    const directory = CastleSpyConfig.MODEL_DIRECTORY + "medieval/";
    const tileJob = loader.loadAsync(directory + "tiles/square_sand.glb").then((gltf) => {
      const mesh = gltf.scene.getObjectByProperty("isMesh", true) as Three<"Mesh">;
      this.tileGeometry = mesh.geometry as unknown as TileGeometry;
    });
    const propJobs = modelNames.map((name) =>
      loader.loadAsync(directory + "objects/" + name + ".glb").then((gltf) => {
        gltf.scene.traverse((node) => {
          const mesh = node as Three<"Mesh">;
          if (!mesh.isMesh || Array.isArray(mesh.material)) return;
          const source = mesh.material as Three<"MeshStandardMaterial">;
          mesh.material = new this.libs.THREE.MeshLambertMaterial({ map: source.map, color: source.color });
        });
        this.props.set(name, gltf.scene);
      }).catch(() => undefined)
    );
    await Promise.all([tileJob, ...propJobs]);
  }

  fit(name: string, footprint: number, height: number): Three<"Group"> | null {
    const template = this.props.get(name);
    if (!template) return null;
    const THREE = this.libs.THREE;
    const box = new THREE.Box3().setFromObject(template);
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.min(footprint / Math.max(size.x, size.z, 0.001), height / Math.max(size.y, 0.001));
    const copy = template.clone(true);
    copy.scale.setScalar(scale);
    copy.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
    const holder = new THREE.Group();
    holder.add(copy);
    return holder;
  }
}

class LabelFactory {
  constructor(private readonly libs: ThreeLibs) {}

  create(text: string, color: string): Three<"Sprite"> {
    const THREE = this.libs.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.beginPath();
    context.roundRect(4, 6, 248, 52, 14);
    context.fillStyle = "rgba(12,16,26,.78)";
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = color;
    context.stroke();
    context.font = '800 30px "Nanum Gothic", "Malgun Gothic", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#FFFFFF";
    context.fillText(text, 128, 34, 232);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(2.6, 0.65, 1);
    return sprite;
  }
}

class MapView {
  static readonly WALL_HEIGHT = 1.7;
  static readonly TILE_THICKNESS = 0.5;

  readonly group: Three<"Group">;
  private readonly markerGroups = new Map<number, Three<"Group">>();
  private readonly markerSpinners = new Map<number, Three<"Mesh">>();

  constructor(
    private readonly libs: ThreeLibs,
    private readonly scenery: SceneryAssets,
    private readonly labels: LabelFactory,
    private readonly map: GameMap
  ) {
    this.group = new libs.THREE.Group();
    this.buildGround();
    this.buildFloors();
    this.buildWalls();
    this.buildProps();
    this.buildTable();
    this.buildTaskMarkers();
    this.buildScenery();
  }

  showTasks(pendingTaskIndices: ReadonlySet<number>): void {
    this.markerSpinners.forEach((spinner, index) => {
      spinner.visible = pendingTaskIndices.has(index);
    });
    this.markerGroups.forEach((marker, index) => {
      const ring = marker.getObjectByName("ring");
      if (ring) ring.visible = pendingTaskIndices.has(index);
    });
  }

  update(seconds: number): void {
    this.markerSpinners.forEach((spinner, index) => {
      spinner.position.y = 1.9 + Math.sin(seconds * 3 + index) * 0.15;
      spinner.rotation.y = seconds * 1.6;
    });
  }

  dispose(): void {
    this.group.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (mesh.isMesh && mesh.geometry && mesh.geometry !== this.scenery.tileGeometry) mesh.geometry.dispose();
    });
  }

  private propCellKeys(): Set<string> {
    const keys = new Set<string>();
    this.map.definition.props.forEach((prop) => keys.add(Math.floor(prop.x) + "," + Math.floor(prop.y)));
    return keys;
  }

  private neighborFloorColor(column: number, row: number): string {
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [offsetColumn, offsetRow] of offsets) {
      const color = this.map.floorColorAt(column + offsetColumn, row + offsetRow);
      if (color) return color;
    }
    return "#A39C8C";
  }

  private buildGround(): void {
    const THREE = this.libs.THREE;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x3A5238 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -MapView.TILE_THICKNESS - 0.15;
    this.group.add(ground);
  }

  private buildFloors(): void {
    const THREE = this.libs.THREE;
    const geometry = this.scenery.tileGeometry as TileGeometry;
    geometry.computeBoundingBox();
    const topY = (geometry.boundingBox as Three<"Box3">).max.y;
    const scaleY = MapView.TILE_THICKNESS / Math.max(0.001, topY * 2);
    const cells: Array<{ column: number; row: number; color: string }> = [];
    const propCells = this.propCellKeys();
    for (let row = 0; row < this.map.rowCount; row++) {
      for (let column = 0; column < this.map.columns; column++) {
        const color = this.map.floorColorAt(column, row) || (propCells.has(column + "," + row) ? this.neighborFloorColor(column, row) : null);
        if (color) cells.push({ column, row, color });
      }
    }
    const floors = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), cells.length);
    floors.frustumCulled = false;
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    const horizontalScale = (this.map.cell / 2) * 0.99;
    cells.forEach((cell, index) => {
      const center = this.map.cellCenter(cell.column, cell.row);
      matrix.compose(
        new THREE.Vector3(center.x, -topY * scaleY, center.z),
        new THREE.Quaternion(),
        new THREE.Vector3(horizontalScale, scaleY, horizontalScale)
      );
      floors.setMatrixAt(index, matrix);
      color.set(cell.color);
      if ((cell.column + cell.row) % 2) color.multiplyScalar(0.92);
      floors.setColorAt(index, color);
    });
    floors.instanceMatrix.needsUpdate = true;
    if (floors.instanceColor) floors.instanceColor.needsUpdate = true;
    this.group.add(floors);
  }

  private buildWalls(): void {
    const THREE = this.libs.THREE;
    const propCells = this.propCellKeys();
    const cells: Array<{ column: number; row: number }> = [];
    for (let row = 0; row < this.map.rowCount; row++) {
      for (let column = 0; column < this.map.columns; column++) {
        if (this.map.isWallCell(column, row) && !propCells.has(column + "," + row)) cells.push({ column, row });
      }
    }
    const height = MapView.WALL_HEIGHT, cell = this.map.cell;
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(cell, height, cell), new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), cells.length);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 1.04, 0.3, cell * 1.04), new THREE.MeshLambertMaterial({ color: 0x8D84A0 }), cells.length);
    bodies.frustumCulled = false;
    caps.frustumCulled = false;
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    cells.forEach((wall, index) => {
      const center = this.map.cellCenter(wall.column, wall.row);
      matrix.makeTranslation(center.x, height / 2 - 0.1, center.z);
      bodies.setMatrixAt(index, matrix);
      color.set("#675F78");
      if ((wall.column * 7 + wall.row * 3) % 3 === 0) color.multiplyScalar(0.9);
      bodies.setColorAt(index, color);
      matrix.makeTranslation(center.x, height - 0.1 + 0.15, center.z);
      caps.setMatrixAt(index, matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    this.group.add(bodies, caps);
  }

  private buildProps(): void {
    this.map.definition.props.forEach((definition) => {
      const prop = this.scenery.fit(definition.model, definition.footprint * this.map.cell / 2, definition.height);
      if (!prop) return;
      prop.position.set(this.map.worldX(definition.x), 0, this.map.worldZ(definition.y));
      this.group.add(prop);
    });
  }

  private buildTable(): void {
    const THREE = this.libs.THREE;
    const position = this.map.tablePosition();
    const table = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x8B5A33 });
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.8, 16), wood);
    leg.position.y = 0.4;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.14, 24), new THREE.MeshLambertMaterial({ color: 0xA9703F }));
    top.position.y = 0.87;
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.2, 16), new THREE.MeshBasicMaterial({ color: 0xE5484D }));
    button.position.y = 1.04;
    const label = this.labels.create("회의 탁자", "#E5484D");
    label.position.y = 2.2;
    table.add(leg, top, button, label);
    table.position.set(position.x, 0, position.z);
    this.group.add(table);
  }

  private buildTaskMarkers(): void {
    const THREE = this.libs.THREE;
    const stone = new THREE.MeshLambertMaterial({ color: 0x7C7488 });
    this.map.definition.tasks.forEach((_, index) => {
      const position = this.map.taskPosition(index);
      const marker = new THREE.Group();
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.6, 12), stone);
      pedestal.position.y = 0.3;
      const spinner = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0xFFD54A }));
      spinner.position.y = 1.9;
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 28), new THREE.MeshBasicMaterial({ color: 0xFFD54A, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.name = "ring";
      marker.add(pedestal, spinner, ring);
      marker.position.set(position.x, 0, position.z);
      this.group.add(marker);
      this.markerGroups.set(index, marker);
      this.markerSpinners.set(index, spinner);
    });
  }

  private buildScenery(): void {
    const random = Mathx.seededRandom(77);
    const halfWidth = (this.map.columns * this.map.cell) / 2, halfDepth = (this.map.rowCount * this.map.cell) / 2;
    const models = SceneryAssets.DECOR_MODELS;
    let placed = 0;
    for (let attempt = 0; attempt < 400 && placed < 70; attempt++) {
      const x = (random() * 2 - 1) * (halfWidth + 26), z = (random() * 2 - 1) * (halfDepth + 22);
      if (Math.abs(x) < halfWidth + 3 && Math.abs(z) < halfDepth + 3) continue;
      const name = models[Math.floor(random() * models.length)];
      const prop = this.scenery.fit(name, 3 + random() * 2, 2.4 + random() * 3);
      if (!prop) continue;
      prop.position.set(x, -0.1, z);
      prop.rotation.y = random() * Math.PI * 2;
      this.group.add(prop);
      placed++;
    }
  }
}

class Actor {
  static readonly CLIP_IDLE = "Idle_A";
  static readonly CLIP_RUN = "Running_A";
  static readonly CLIP_STAB = "Melee_1H_Attack_Stab";
  static readonly CLIP_WORK = "Melee_1H_Attack_Chop";
  static readonly GHOST_OPACITY = 0.42;

  x = 0;
  z = 0;
  yaw = 0;
  moving = false;
  alive = true;
  role: Role | null = null;
  readonly color: string;
  readonly group: Three<"Group">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly materials: Three<"Material">[] = [];
  private targetX = 0;
  private targetZ = 0;
  private shownYaw = 0;
  private actionUntilMs = 0;
  private ghostShown = false;

  constructor(
    libs: ThreeLibs,
    private readonly factory: CharacterModelFactory,
    assets: CharacterAssets,
    labels: LabelFactory,
    parent: Three<"Object3D">,
    readonly id: string,
    readonly record: PlayerRecord
  ) {
    const THREE = libs.THREE;
    this.color = CastleSpyConfig.SLOT_COLORS[record.slot % CastleSpyConfig.SLOT_COLORS.length];
    this.group = new THREE.Group();
    this.model = factory.build(CharacterLooks.clean(record.look));
    this.group.add(this.model);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.74, 28), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const label = labels.create(record.nick + (record.isBot ? " (AI)" : ""), this.color);
    label.position.y = 2.75;
    this.group.add(ring, label);
    parent.add(this.group);
    this.model.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (mesh.isMesh && !Array.isArray(mesh.material)) this.materials.push(mesh.material);
    });
    this.animator = new CharacterAnimator(libs, this.model, assets.clips);
    this.animator.play(Actor.CLIP_IDLE);
  }

  placeAt(x: number, z: number): void {
    this.x = this.targetX = x;
    this.z = this.targetZ = z;
  }

  receiveRemote(x: number, z: number, yaw: number, moving: boolean): void {
    this.targetX = x;
    this.targetZ = z;
    this.yaw = yaw;
    this.moving = moving;
  }

  stepRemote(deltaSeconds: number): void {
    const follow = Math.min(1, deltaSeconds * 12);
    this.x = Mathx.lerp(this.x, this.targetX, follow);
    this.z = Mathx.lerp(this.z, this.targetZ, follow);
  }

  playAction(clipName: string, durationMs: number, nowMs: number): void {
    this.animator.play(clipName, { once: true });
    this.actionUntilMs = nowMs + durationMs;
  }

  setGhost(ghost: boolean): void {
    if (ghost === this.ghostShown) return;
    this.ghostShown = ghost;
    this.materials.forEach((material) => {
      material.transparent = ghost;
      material.opacity = ghost ? Actor.GHOST_OPACITY : 1;
      material.depthWrite = !ghost;
      material.needsUpdate = true;
    });
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  render(deltaSeconds: number, nowMs: number): void {
    this.shownYaw += Mathx.angleDifference(this.yaw, this.shownYaw) * Math.min(1, deltaSeconds * 14);
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.shownYaw;
    if (nowMs >= this.actionUntilMs) this.animator.play(this.moving ? Actor.CLIP_RUN : Actor.CLIP_IDLE);
    this.animator.update(deltaSeconds);
  }

  dispose(parent: Three<"Object3D">): void {
    parent.remove(this.group);
    this.factory.disposeModel(this.model);
  }
}

class BodyView {
  readonly group: Three<"Group">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;

  constructor(
    libs: ThreeLibs,
    private readonly factory: CharacterModelFactory,
    assets: CharacterAssets,
    private readonly parent: Three<"Object3D">,
    record: PlayerRecord,
    readonly x: number,
    readonly z: number
  ) {
    this.group = new libs.THREE.Group();
    this.model = factory.build(CharacterLooks.clean(record.look));
    this.group.add(this.model);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = (x * 7.3 + z * 3.1) % (Math.PI * 2);
    parent.add(this.group);
    this.animator = new CharacterAnimator(libs, this.model, assets.clips);
    this.animator.play("Death_A", { once: true });
  }

  update(deltaSeconds: number): void {
    this.animator.update(deltaSeconds);
  }

  dispose(): void {
    this.parent.remove(this.group);
    this.factory.disposeModel(this.model);
  }
}

class WorldView {
  private static readonly CAMERA_HEIGHT = 17;
  private static readonly CAMERA_BACK = 9.5;

  readonly scene: Three<"Scene">;
  readonly world: Three<"Group">;
  private readonly renderer: Three<"WebGLRenderer">;
  private readonly camera: Three<"PerspectiveCamera">;
  private pixelRatio: number;
  private focusX = 0;
  private focusZ = 0;
  private focusReady = false;
  private slowSeconds = 0;
  private fpsSeconds = 0;
  private fpsFrames = 0;

  constructor(libs: ThreeLibs, canvas: HTMLCanvasElement, touchDevice: boolean) {
    const THREE = libs.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#1A2236");
    this.scene.fog = new THREE.Fog("#1A2236", 34, 80);
    this.scene.add(new THREE.HemisphereLight(0xDCE6FF, 0x40324A, 1.25));
    const sun = new THREE.DirectionalLight(0xFFF0D2, 1.5);
    sun.position.set(6, 16, 9);
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width / height < 0.9 ? 52 : 42;
    this.camera.updateProjectionMatrix();
  }

  follow(x: number, z: number, deltaSeconds: number): void {
    if (!this.focusReady) {
      this.focusX = x;
      this.focusZ = z;
      this.focusReady = true;
    }
    const ratio = Math.min(1, deltaSeconds * 7);
    this.focusX += (x - this.focusX) * ratio;
    this.focusZ += (z - this.focusZ) * ratio;
    this.camera.position.set(this.focusX, WorldView.CAMERA_HEIGHT, this.focusZ + WorldView.CAMERA_BACK);
    this.camera.lookAt(this.focusX, 0, this.focusZ - 0.5);
  }

  snapCamera(): void {
    this.focusReady = false;
  }

  orbit(centerX: number, centerZ: number, radius: number, height: number, angle: number): void {
    this.camera.position.set(centerX + Math.sin(angle) * radius, height, centerZ + Math.cos(angle) * radius);
    this.camera.lookAt(centerX, 0, centerZ);
  }

  render(deltaSeconds: number): void {
    this.renderer.render(this.scene, this.camera);
    this.adaptQuality(deltaSeconds);
  }

  private adaptQuality(deltaSeconds: number): void {
    this.fpsSeconds += deltaSeconds;
    this.fpsFrames++;
    if (this.fpsSeconds < 0.5) return;
    const fps = this.fpsFrames / this.fpsSeconds;
    this.fpsSeconds = 0;
    this.fpsFrames = 0;
    this.slowSeconds = fps < 45 ? this.slowSeconds + 0.5 : Math.max(0, this.slowSeconds - 0.5);
    if (this.slowSeconds >= 3 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
      this.slowSeconds = 0;
    }
  }
}

interface MovementAxis { x: number; z: number }

class InputController {
  private static readonly JOYSTICK_RADIUS = 55;
  private static readonly DEAD_ZONE = 0.18;

  onUse: () => void = () => undefined;
  onReport: () => void = () => undefined;
  onKill: () => void = () => undefined;
  enabled = true;
  private readonly held = new Set<string>();
  private joystickPointer: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;
  private joystickX = 0;
  private joystickZ = 0;

  constructor(private readonly zone: HTMLElement, private readonly base: HTMLElement, private readonly knob: HTMLElement) {
    this.bindKeyboard();
    this.bindJoystick();
    this.bindButton("btnUse", () => this.onUse());
    this.bindButton("btnReport", () => this.onReport());
    this.bindButton("btnKill", () => this.onKill());
  }

  axis(): MovementAxis {
    if (!this.enabled) return { x: 0, z: 0 };
    let x = this.joystickX, z = this.joystickZ;
    if (this.held.has("KeyA") || this.held.has("ArrowLeft")) x -= 1;
    if (this.held.has("KeyD") || this.held.has("ArrowRight")) x += 1;
    if (this.held.has("KeyW") || this.held.has("ArrowUp")) z -= 1;
    if (this.held.has("KeyS") || this.held.has("ArrowDown")) z += 1;
    const length = Math.hypot(x, z);
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  }

  releaseAll(): void {
    this.held.clear();
    this.joystickPointer = null;
    this.joystickX = this.joystickZ = 0;
    this.base.hidden = true;
  }

  private bindKeyboard(): void {
    const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
    window.addEventListener("keydown", (event) => {
      if ((event.target as HTMLElement).tagName === "INPUT" || !this.enabled) return;
      const code = this.codeOf(event);
      if (movementKeys.indexOf(code) >= 0) {
        this.held.add(code);
        event.preventDefault();
      } else if (!event.repeat && (code === "KeyE" || code === "Space")) {
        this.onUse();
        event.preventDefault();
      } else if (!event.repeat && code === "KeyR") this.onReport();
      else if (!event.repeat && (code === "KeyQ" || code === "KeyK")) this.onKill();
    });
    window.addEventListener("keyup", (event) => this.held.delete(this.codeOf(event)));
    window.addEventListener("blur", () => this.held.clear());
  }

  private codeOf(event: KeyboardEvent): string {
    return event.key.indexOf("Arrow") === 0 ? event.key : event.code;
  }

  private bindJoystick(): void {
    this.zone.addEventListener("pointerdown", (event) => {
      if (this.joystickPointer !== null) return;
      this.joystickPointer = event.pointerId;
      this.joystickOriginX = event.clientX;
      this.joystickOriginY = event.clientY;
      this.base.style.left = event.clientX + "px";
      this.base.style.top = event.clientY + "px";
      this.base.hidden = false;
      this.knob.style.transform = "translate(0px,0px)";
      this.zone.setPointerCapture(event.pointerId);
    });
    this.zone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      const deltaX = event.clientX - this.joystickOriginX, deltaY = event.clientY - this.joystickOriginY;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const reach = Math.min(length, InputController.JOYSTICK_RADIUS);
      this.knob.style.transform = "translate(" + (deltaX / length) * reach + "px," + (deltaY / length) * reach + "px)";
      const strength = Math.min(1, length / InputController.JOYSTICK_RADIUS);
      if (strength < InputController.DEAD_ZONE) this.joystickX = this.joystickZ = 0;
      else {
        this.joystickX = (deltaX / length) * strength;
        this.joystickZ = (deltaY / length) * strength;
      }
    });
    const end = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.joystickX = this.joystickZ = 0;
      this.base.hidden = true;
    };
    this.zone.addEventListener("pointerup", end);
    this.zone.addEventListener("pointercancel", end);
  }

  private bindButton(id: string, action: () => void): void {
    const button = Dom.byId(id);
    button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (this.enabled) action();
    });
  }
}

abstract class TaskGame {
  private static readonly CLOSE_DELAY_MS = 700;

  protected body!: HTMLElement;
  protected finished = false;
  private card!: HTMLElement;
  private readonly keyDownHandler = (event: KeyboardEvent) => this.handleKey(event, true);
  private readonly keyUpHandler = (event: KeyboardEvent) => this.handleKey(event, false);

  constructor(
    protected readonly overlay: HTMLElement,
    protected readonly title: string,
    private readonly onFinished: (completed: boolean) => void
  ) {}

  open(): void {
    this.overlay.innerHTML = "<div class='task-card'><h2></h2><div class='task-body'></div><button type='button' class='st-btn sub slim task-close'>그만두기</button></div>";
    this.card = this.overlay.firstElementChild as HTMLElement;
    (this.card.querySelector("h2") as HTMLElement).textContent = this.title;
    this.body = this.card.querySelector(".task-body") as HTMLElement;
    (this.card.querySelector(".task-close") as HTMLButtonElement).addEventListener("click", () => this.abandon());
    this.overlay.hidden = false;
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    this.build();
  }

  update(deltaSeconds: number): void {
    if (!this.finished) this.tick(deltaSeconds);
  }

  abandon(): void {
    this.closeCard();
    this.onFinished(false);
  }

  protected abstract build(): void;

  protected tick(_deltaSeconds: number): void {
    return;
  }

  protected handleKey(_event: KeyboardEvent, _pressed: boolean): void {
    return;
  }

  protected complete(): void {
    if (this.finished) return;
    this.finished = true;
    this.body.innerHTML = "<div class='task-done'>완료!</div>";
    setTimeout(() => {
      this.closeCard();
      this.onFinished(true);
    }, TaskGame.CLOSE_DELAY_MS);
  }

  private closeCard(): void {
    this.finished = true;
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    this.overlay.hidden = true;
    this.overlay.innerHTML = "";
  }
}

class HoldTask extends TaskGame {
  private static readonly SECONDS_TO_FINISH = 2.5;
  private progress = 0;
  private holding = false;
  private fill!: HTMLElement;

  protected build(): void {
    this.body.innerHTML = "<p class='task-tip'>버튼을 꾹 누르고 있어요</p><button type='button' class='task-hold'>누르고 있기</button><div class='task-bar'><i></i></div>";
    this.fill = this.body.querySelector(".task-bar i") as HTMLElement;
    const button = this.body.querySelector(".task-hold") as HTMLButtonElement;
    button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    button.addEventListener("pointerdown", () => { this.holding = true; });
    ["pointerup", "pointerleave", "pointercancel"].forEach((name) => button.addEventListener(name, () => { this.holding = false; }));
  }

  protected tick(deltaSeconds: number): void {
    this.progress = this.holding
      ? this.progress + deltaSeconds / HoldTask.SECONDS_TO_FINISH
      : Math.max(0, this.progress - deltaSeconds * 1.5);
    this.fill.style.width = Math.min(100, this.progress * 100) + "%";
    if (this.progress >= 1) this.complete();
  }

  protected handleKey(event: KeyboardEvent, pressed: boolean): void {
    if (event.code === "Space" || event.code === "Enter") {
      this.holding = pressed;
      event.preventDefault();
    }
  }
}

class SequenceTask extends TaskGame {
  private static readonly COUNT = 5;
  private next = 1;

  protected build(): void {
    const order = Mathx.shuffled(Array.from({ length: SequenceTask.COUNT }, (_, index) => index + 1), Math.random);
    this.body.innerHTML = "<p class='task-tip'>1부터 5까지 순서대로 눌러요</p><div class='task-seq'>" +
      order.map((number) => "<button type='button' data-n='" + number + "'>" + number + "</button>").join("") + "</div>";
    this.body.querySelector(".task-seq")!.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest("button[data-n]") as HTMLButtonElement | null;
      if (button) this.press(button);
    });
  }

  private press(button: HTMLButtonElement): void {
    if (this.finished || button.classList.contains("on")) return;
    if (Number(button.dataset.n) === this.next) {
      button.classList.add("on");
      this.next++;
      if (this.next > SequenceTask.COUNT) this.complete();
      return;
    }
    this.next = 1;
    this.body.querySelectorAll("button").forEach((other) => other.classList.remove("on"));
    button.classList.add("wrong");
    setTimeout(() => button.classList.remove("wrong"), 250);
  }
}

class TimingTask extends TaskGame {
  private static readonly HITS_NEEDED = 3;
  private static readonly ZONE_WIDTH = 0.2;
  private static readonly SWEEP_SECONDS = 1.1;
  private hits = 0;
  private clock = 0;
  private zoneStart = 0.4;
  private cursor!: HTMLElement;
  private zone!: HTMLElement;
  private message!: HTMLElement;

  protected build(): void {
    this.body.innerHTML = "<p class='task-tip'>초록 칸 안에서 멈춰요 (<span class='task-hits'>0</span>/" + TimingTask.HITS_NEEDED + ")</p>" +
      "<div class='task-track'><div class='task-zone'></div><div class='task-cursor'></div></div><button type='button' class='task-hold'>멈춰!</button><div class='task-msg'></div>";
    this.cursor = this.body.querySelector(".task-cursor") as HTMLElement;
    this.zone = this.body.querySelector(".task-zone") as HTMLElement;
    this.message = this.body.querySelector(".task-msg") as HTMLElement;
    const stop = this.body.querySelector(".task-hold") as HTMLButtonElement;
    stop.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    stop.addEventListener("pointerdown", () => this.stop());
    this.moveZone();
  }

  protected tick(deltaSeconds: number): void {
    this.clock += deltaSeconds;
    this.cursor.style.left = this.cursorPosition() * 100 + "%";
  }

  protected handleKey(event: KeyboardEvent, pressed: boolean): void {
    if (pressed && !event.repeat && (event.code === "Space" || event.code === "Enter")) {
      this.stop();
      event.preventDefault();
    }
  }

  private cursorPosition(): number {
    const phase = (this.clock / TimingTask.SWEEP_SECONDS) % 2;
    return phase < 1 ? phase : 2 - phase;
  }

  private moveZone(): void {
    this.zoneStart = 0.1 + Math.random() * (0.8 - TimingTask.ZONE_WIDTH);
    this.zone.style.left = this.zoneStart * 100 + "%";
    this.zone.style.width = TimingTask.ZONE_WIDTH * 100 + "%";
  }

  private stop(): void {
    if (this.finished) return;
    const position = this.cursorPosition();
    const hit = position >= this.zoneStart && position <= this.zoneStart + TimingTask.ZONE_WIDTH;
    this.hits = hit ? this.hits + 1 : Math.max(0, this.hits - 1);
    this.message.textContent = hit ? "좋아요!" : "아쉬워요";
    (this.body.querySelector(".task-hits") as HTMLElement).textContent = String(this.hits);
    if (this.hits >= TimingTask.HITS_NEEDED) this.complete();
    else this.moveZone();
  }
}

class TaskGameCatalog {
  private static readonly CREATORS: Record<TaskKind, new (overlay: HTMLElement, title: string, onFinished: (completed: boolean) => void) => TaskGame> = {
    hold: HoldTask,
    sequence: SequenceTask,
    timing: TimingTask
  };

  static create(kind: TaskKind, overlay: HTMLElement, title: string, onFinished: (completed: boolean) => void): TaskGame {
    return new TaskGameCatalog.CREATORS[kind](overlay, title, onFinished);
  }
}

interface MeetingCard {
  id: string;
  nick: string;
  color: string;
  alive: boolean;
  voted: boolean;
  votesReceived: number;
}

interface MeetingRenderState {
  title: string;
  phase: MeetingPhase;
  secondsLeft: number;
  cards: MeetingCard[];
  myVote: string | null;
  canVote: boolean;
  skipVotes: number;
  resultText: string;
}

class MeetingView {
  private readonly root = Dom.byId("meetingScreen");
  private readonly titleLabel = Dom.byId("meetingTitle");
  private readonly phaseLabel = Dom.byId("meetingPhase");
  private readonly cardBox = Dom.byId("meetingCards");
  private readonly skipButton = Dom.byId<HTMLButtonElement>("btnSkipVote");
  private readonly resultBox = Dom.byId("meetingResult");
  private lastSignature = "";
  onVote: (target: string) => void = () => undefined;

  constructor() {
    this.cardBox.addEventListener("click", (event) => {
      const card = (event.target as HTMLElement).closest(".mv-card[data-id]") as HTMLElement | null;
      if (card && !card.classList.contains("locked")) this.onVote(card.dataset.id as string);
    });
    this.skipButton.addEventListener("click", () => this.onVote(CastleSpyConfig.VOTE_SKIP));
  }

  open(): void {
    this.lastSignature = "";
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  render(state: MeetingRenderState): void {
    Dom.setText(this.titleLabel, state.title);
    const phaseText = state.phase === "talk" ? "토론 시간" : state.phase === "vote" ? "투표 시간" : "투표 결과";
    Dom.setText(this.phaseLabel, phaseText + " · " + Math.max(0, Math.ceil(state.secondsLeft)) + "초");
    const signature = JSON.stringify([state.phase, state.cards, state.myVote, state.canVote, state.skipVotes, state.resultText]);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.cardBox.innerHTML = state.cards.map((card) => this.cardHtml(card, state)).join("");
    this.skipButton.hidden = state.phase === "result";
    this.skipButton.disabled = !state.canVote || state.myVote !== null;
    this.skipButton.classList.toggle("picked", state.myVote === CastleSpyConfig.VOTE_SKIP);
    Dom.setText(this.skipButton, state.myVote === CastleSpyConfig.VOTE_SKIP ? "건너뛰기 선택함" : "건너뛰기");
    this.resultBox.hidden = !state.resultText;
    this.resultBox.textContent = state.resultText;
  }

  private cardHtml(card: MeetingCard, state: MeetingRenderState): string {
    const locked = !state.canVote || !card.alive || state.myVote !== null;
    const picked = state.myVote === card.id;
    const badge = state.phase === "result"
      ? (card.votesReceived ? "<em>" + card.votesReceived + "표</em>" : "")
      : (card.voted ? "<em>투표함</em>" : "");
    return "<div class='mv-card" + (card.alive ? "" : " dead") + (picked ? " picked" : "") + (locked ? " locked" : "") + "' data-id='" + card.id + "'>" +
      "<i style='background:" + card.color + "'></i><b>" + Dom.escape(card.nick) + "</b>" + (card.alive ? "" : "<small>탈락</small>") + badge + "</div>";
  }
}

class Hud {
  private readonly roleChip = Dom.byId("hudRole");
  private readonly taskList = Dom.byId("hudTaskList");
  private readonly progressFill = Dom.byId("hudProgressFill");
  private readonly progressText = Dom.byId("hudProgressText");
  private readonly useButton = Dom.byId<HTMLButtonElement>("btnUse");
  private readonly reportButton = Dom.byId<HTMLButtonElement>("btnReport");
  private readonly killButton = Dom.byId<HTMLButtonElement>("btnKill");
  private readonly killCooldown = Dom.byId("btnKillCooldown");
  private readonly banner = Dom.byId("banner");
  private readonly bannerText = Dom.byId("bannerBox");
  private readonly roleReveal = Dom.byId("roleReveal");
  private bannerTimer = 0;

  setRole(role: Role | null): void {
    this.roleChip.hidden = !role;
    if (!role) return;
    this.roleChip.className = "hud-box role-" + role;
    Dom.setText(this.roleChip, role === "spy" ? "당신은 스파이" : "당신은 용사");
  }

  setTasks(items: Array<{ title: string; room: string; done: boolean }>, isSpy: boolean): void {
    const heading = isSpy ? "가짜 할 일 (들키지 않게!)" : "내 할 일";
    this.taskList.innerHTML = "<span class='lab'>" + heading + "</span>" + items.map((item) =>
      "<div class='task" + (item.done ? " done" : "") + "'>" + Dom.escape(item.room) + " · " + Dom.escape(item.title) + "</div>"
    ).join("");
  }

  setProgress(done: number, total: number): void {
    const ratio = total > 0 ? done / total : 0;
    this.progressFill.style.width = ratio * 100 + "%";
    Dom.setText(this.progressText, "할 일 " + done + " / " + total);
  }

  setUseLabel(label: string | null): void {
    this.useButton.hidden = !label;
    if (label) Dom.setText(this.useButton.querySelector("span") as HTMLElement, label);
  }

  setReportVisible(visible: boolean): void {
    this.reportButton.hidden = !visible;
  }

  setKill(visible: boolean, ready: boolean, cooldownRatio: number): void {
    this.killButton.hidden = !visible;
    this.killButton.classList.toggle("ready", ready);
    this.killCooldown.style.height = (ready ? 0 : cooldownRatio * 100) + "%";
  }

  showBanner(text: string, durationMs: number): void {
    this.bannerText.textContent = text;
    this.banner.hidden = false;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => { this.banner.hidden = true; }, durationMs);
  }

  showRoleReveal(role: Role, partnerNames: string[], durationMs: number): void {
    const text = role === "spy"
      ? "<h1 class='spy'>당신은 스파이!</h1><p>들키지 않게 용사들을 하나씩 처치하세요.</p>"
      : "<h1 class='hero'>당신은 용사!</h1><p>할 일을 모두 끝내고, 숨은 스파이를 찾아내세요.</p>";
    this.roleReveal.innerHTML = text + (partnerNames.length ? "<p>동료 스파이: " + partnerNames.map(Dom.escape).join(", ") + "</p>" : "");
    this.roleReveal.hidden = false;
    setTimeout(() => { this.roleReveal.hidden = true; }, durationMs);
  }
}

type RoomStatus = "lobby" | "play" | "end";
type ChangeKind = "players" | "host" | "status" | "map" | "match" | "roles" | "tasks" | "done" | "dead" | "out" | "buttons" | "meeting" | "votes" | "result" | "end" | "progress";

interface RemoteState { x: number; z: number; yaw: number; moving: boolean }
interface JoinOutcome { ok: boolean; message: string }

class StateCodec {
  static encode(x: number, z: number, yaw: number, moving: boolean): string {
    return [Mathx.round2(x), Mathx.round2(z), Mathx.round2(yaw), moving ? 1 : 0].join(",");
  }

  static decode(raw: unknown): RemoteState | null {
    if (typeof raw !== "string") return null;
    const parts = raw.split(",").map(Number);
    if (parts.length < 4 || parts.some((part) => isNaN(part))) return null;
    return { x: parts[0], z: parts[1], yaw: parts[2], moving: parts[3] === 1 };
  }
}

class Backend {
  readonly database: FirebaseDatabase | null = null;
  private serverOffset = 0;

  constructor() {
    const config = window.PORTAL_CONFIG;
    try {
      if (window.firebase && config && config.isReady()) {
        window.firebase.initializeApp({ apiKey: config.API_KEY, authDomain: config.AUTH_DOMAIN, databaseURL: config.DB_URL.replace(/\/+$/, "") });
        this.database = window.firebase.database();
      }
    } catch (error) {
      this.database = null;
    }
    if (this.database) {
      this.database.ref(".info/serverTimeOffset").on("value", (snapshot) => {
        this.serverOffset = snapshot.val<number>() || 0;
      });
    }
  }

  now(): number {
    return Date.now() + this.serverOffset;
  }

  databaseUrl(): string {
    return window.PORTAL_CONFIG ? window.PORTAL_CONFIG.DB_URL.replace(/\/+$/, "") : "";
  }
}

class RoomSession {
  private static readonly REJOIN_TRIES = 3;

  readonly players = new Map<string, PlayerRecord>();
  hostId: string | null = null;
  hostLoaded = false;
  status: RoomStatus = "lobby";
  mapId: string = MapCatalog.ALL[0].id;
  match: MatchRecord | null = null;
  roles: Record<string, Role> = {};
  tasks: Record<string, number[]> = {};
  done: Record<string, number> = {};
  dead: Record<string, DeadRecord> = {};
  out: Record<string, number> = {};
  buttonUsed: Record<string, boolean> = {};
  meeting: MeetingRecord | null = null;
  votes: Record<string, Record<string, string>> = {};
  result: ResultRecord | null = null;
  end: EndRecord | null = null;
  progress: TaskProgress | null = null;
  onChange: (kind: ChangeKind) => void = () => undefined;
  onRemoteState: (id: string, state: RemoteState) => void = () => undefined;
  onClosed: (message: string) => void = () => undefined;
  readonly ref: FirebaseRef;
  private subscriptions: Array<{ ref: FirebaseRef; event: FirebaseEvent; listener: (snapshot: FirebaseSnapshot) => void }> = [];
  private leaving = false;

  constructor(private readonly backend: Backend, readonly code: string, readonly myId: string) {
    this.ref = (backend.database as FirebaseDatabase).ref(CastleSpyConfig.ROOT + "/" + code);
  }

  isHost(): boolean {
    return this.hostId === this.myId;
  }

  order(): string[] {
    return Array.from(this.players.keys()).sort((a, b) => {
      const difference = (this.players.get(a) as PlayerRecord).joinedAt - (this.players.get(b) as PlayerRecord).joinedAt;
      return difference || (a < b ? -1 : 1);
    });
  }

  humanIds(): string[] {
    return this.order().filter((id) => !(this.players.get(id) as PlayerRecord).isBot);
  }

  freeSlot(): number {
    const used = new Set<number>();
    this.players.forEach((record) => used.add(record.slot));
    for (let slot = 0; slot < CastleSpyConfig.MAX_PLAYERS; slot++) if (!used.has(slot)) return slot;
    return 0;
  }

  isAlive(id: string): boolean {
    return this.players.has(id) && !this.dead[id] && this.out[id] === undefined;
  }

  connect(): void {
    this.armDisconnect();
    const playersRef = this.ref.child("players");
    this.subscribe(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
    this.subscribe(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
    this.subscribe(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
    this.subscribe((this.backend.database as FirebaseDatabase).ref(".info/connected"), "value", (snapshot) => {
      if (snapshot.val<boolean>() === true && !this.leaving) this.armDisconnect();
    });
    this.watchValue("hostPlayerId", (value) => { this.hostId = (value as string) || null; this.hostLoaded = true; this.electHost(); this.onChange("host"); });
    this.watchValue("status", (value) => {
      if (value === null) { if (!this.leaving) this.onClosed("방이 종료되었어요."); return; }
      this.status = value as RoomStatus;
      this.onChange("status");
    });
    this.watchValue("mapId", (value) => { this.mapId = (value as string) || MapCatalog.ALL[0].id; this.onChange("map"); });
    this.watchValue("match", (value) => { this.match = value as MatchRecord | null; this.onChange("match"); });
    this.watchValue("roles/" + this.myId, (value) => {
      if (value) this.roles[this.myId] = value as Role; else delete this.roles[this.myId];
      this.onChange("roles");
    });
    this.watchValue("tasks", (value) => { this.tasks = (value as Record<string, number[]>) || {}; this.onChange("tasks"); });
    this.watchValue("done", (value) => { this.done = (value as Record<string, number>) || {}; this.onChange("done"); });
    this.watchValue("dead", (value) => { this.dead = (value as Record<string, DeadRecord>) || {}; this.onChange("dead"); });
    this.watchValue("out", (value) => { this.out = (value as Record<string, number>) || {}; this.onChange("out"); });
    this.watchValue("buttonUsed", (value) => { this.buttonUsed = (value as Record<string, boolean>) || {}; this.onChange("buttons"); });
    this.watchValue("meeting", (value) => { this.meeting = value as MeetingRecord | null; this.onChange("meeting"); });
    this.watchValue("votes", (value) => { this.votes = (value as Record<string, Record<string, string>>) || {}; this.onChange("votes"); });
    this.watchValue("result", (value) => { this.result = value as ResultRecord | null; this.onChange("result"); });
    this.watchValue("end", (value) => { this.end = value as EndRecord | null; this.onChange("end"); });
    this.watchValue("progress", (value) => { this.progress = value as TaskProgress | null; this.onChange("progress"); });
    const stateRef = this.ref.child("st");
    const onState = (snapshot: FirebaseSnapshot) => {
      const state = StateCodec.decode(snapshot.val());
      if (state && snapshot.key !== this.myId) this.onRemoteState(snapshot.key, state);
    };
    this.subscribe(stateRef, "child_added", onState);
    this.subscribe(stateRef, "child_changed", onState);
  }

  loadAllRoles(): Promise<void> {
    return this.ref.child("roles").once("value").then((snapshot) => {
      this.roles = snapshot.val<Record<string, Role>>() || {};
      this.onChange("roles");
    });
  }

  pushProfile(record: Pick<PlayerRecord, "nick" | "look">): void {
    if (this.players.has(this.myId)) this.ref.child("players/" + this.myId).update({ nick: record.nick, look: record.look });
  }

  writeState(raw: string): void {
    this.ref.child("st/" + this.myId).set(raw);
  }

  leave(): void {
    this.leaving = true;
    this.unsubscribeAll();
    const mine = this.ref.child("players/" + this.myId);
    try { mine.onDisconnect().cancel(); } catch (error) { return; }
    mine.remove()
      .then(() => this.ref.child("players").once("value"))
      .then((snapshot) => {
        const players = snapshot.val<Record<string, PlayerRecord>>() || {};
        const humans = Object.keys(players).filter((id) => !players[id].isBot).sort((a, b) => players[a].joinedAt - players[b].joinedAt);
        if (!humans.length) return this.ref.remove();
        return this.ref.child("hostPlayerId").once("value").then((host) => {
          const hostId = host.val<string>();
          if (!hostId || !players[hostId] || players[hostId].isBot) return this.ref.update({ hostPlayerId: humans[0] });
        });
      })
      .catch(() => undefined);
  }

  silentClose(): void {
    this.leaving = true;
    this.unsubscribeAll();
    try { this.ref.child("players/" + this.myId).onDisconnect().cancel(); } catch (error) { return; }
  }

  removeMineOnUnload(): void {
    try { this.ref.child("players/" + this.myId).remove(); } catch (error) { return; }
  }

  private watchValue(path: string, apply: (value: unknown) => void): void {
    this.subscribe(this.ref.child(path), "value", (snapshot) => apply(snapshot.val()));
  }

  private subscribe(ref: FirebaseRef, event: FirebaseEvent, listener: (snapshot: FirebaseSnapshot) => void): void {
    ref.on(event, listener);
    this.subscriptions.push({ ref, event, listener });
  }

  private unsubscribeAll(): void {
    this.subscriptions.forEach((entry) => {
      try { entry.ref.off(entry.event, entry.listener); } catch (error) { return; }
    });
    this.subscriptions = [];
  }

  private armDisconnect(): void {
    this.ref.child("players/" + this.myId).onDisconnect().remove();
    this.ref.child("st/" + this.myId).onDisconnect().remove();
  }

  private setPlayer(snapshot: FirebaseSnapshot): void {
    const record = snapshot.val<PlayerRecord>();
    if (!record) return;
    record.look = CharacterLooks.clean(record.look);
    this.players.set(snapshot.key, record);
    this.onChange("players");
  }

  private removePlayer(snapshot: FirebaseSnapshot): void {
    const gone = this.players.get(snapshot.key) || snapshot.val<PlayerRecord>();
    if (snapshot.key === this.myId && !this.leaving) {
      this.rejoinAfterDrop(gone, 0);
      return;
    }
    this.players.delete(snapshot.key);
    this.electHost();
    this.onChange("players");
  }

  private rejoinAfterDrop(last: PlayerRecord | null, tries: number): void {
    if (!last || tries >= RoomSession.REJOIN_TRIES) {
      if (!this.leaving) this.onClosed("연결이 끊겨 방에서 나왔어요.");
      return;
    }
    this.ref.child("status").once("value").then((snapshot) => {
      if (this.leaving) return;
      if (snapshot.val() === null) { this.onClosed("방이 종료되었어요."); return; }
      return this.ref.child("players/" + this.myId).set(last).then(() => this.armDisconnect());
    }).catch(() => {
      if (!this.leaving) setTimeout(() => this.rejoinAfterDrop(last, tries + 1), 1000);
    });
  }

  private electHost(): void {
    if (!this.hostLoaded || !this.players.has(this.myId)) return;
    const current = this.hostId ? this.players.get(this.hostId) : null;
    if (current && !current.isBot) return;
    if (this.humanIds()[0] === this.myId) {
      this.hostId = this.myId;
      this.ref.update({ hostPlayerId: this.myId });
    }
  }
}

class RoomDirectory {
  private static readonly STALE_EMPTY_MS = 60000;
  private static readonly STALE_OLD_MS = 6 * 3600000;

  constructor(private readonly backend: Backend) {}

  async create(myId: string, record: PlayerRecord): Promise<string | null> {
    await this.sweep();
    const database = this.backend.database as FirebaseDatabase;
    for (let attempt = 0; attempt < 9; attempt++) {
      const code = String(10000 + Math.floor(Math.random() * 90000));
      const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.now(), mapId: MapCatalog.ALL[0].id, players: { [myId]: record } };
      const result = await database.ref(CastleSpyConfig.ROOT + "/" + code).transaction((current) => (current !== null ? undefined : room));
      if (result.committed) return code;
    }
    return null;
  }

  async join(code: string, myId: string, record: PlayerRecord): Promise<JoinOutcome> {
    const room = (this.backend.database as FirebaseDatabase).ref(CastleSpyConfig.ROOT + "/" + code);
    const [playersSnapshot, statusSnapshot] = await Promise.all([room.child("players").once("value"), room.child("status").once("value")]);
    const players = playersSnapshot.val<Record<string, PlayerRecord>>();
    if (!players || !Object.keys(players).some((id) => !players[id].isBot)) return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
    if (statusSnapshot.val<string>() !== "lobby") return { ok: false, message: "이미 게임이 진행 중이에요. 끝난 뒤 다시 들어와 주세요." };
    if (Object.keys(players).length >= CastleSpyConfig.MAX_PLAYERS) return { ok: false, message: "방이 가득 찼어요. (최대 " + CastleSpyConfig.MAX_PLAYERS + "명)" };
    const used = new Set<number>();
    Object.keys(players).forEach((id) => used.add(players[id].slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    await room.child("players/" + myId).set(Object.assign({}, record, { slot }));
    return { ok: true, message: "" };
  }

  private async sweep(): Promise<void> {
    try {
      const base = this.backend.databaseUrl();
      const response = await fetch(base + "/" + CastleSpyConfig.ROOT + ".json?shallow=true");
      const codes = response.ok ? Object.keys((await response.json()) || {}) : [];
      const now = this.backend.now();
      const database = this.backend.database as FirebaseDatabase;
      const updates: Record<string, null> = {};
      await Promise.all(codes.map(async (code) => {
        const room = database.ref(CastleSpyConfig.ROOT + "/" + code);
        const [created, players] = await Promise.all([room.child("createdAt").once("value"), room.child("players").once("value")]);
        const age = now - (created.val<number>() || 0);
        const map = players.val<Record<string, PlayerRecord>>() || {};
        const hasHuman = Object.keys(map).some((id) => !map[id].isBot);
        if ((!hasHuman && age > RoomDirectory.STALE_EMPTY_MS) || age > RoomDirectory.STALE_OLD_MS) updates[code] = null;
      }));
      if (Object.keys(updates).length) await database.ref(CastleSpyConfig.ROOT).update(updates);
    } catch (error) {
      return;
    }
  }
}

interface BodyPosition { id: string; x: number; z: number }

interface BotWorld {
  readonly map: GameMap;
  readonly random: () => number;
  actorList(): Actor[];
  isAlive(id: string): boolean;
  roleOf(id: string): Role | null;
  assignedTasks(id: string): number[];
  isTaskDone(id: string, taskIndex: number): boolean;
  completeTask(id: string, taskIndex: number): void;
  killBy(spyId: string, victimId: string): void;
  reportBy(callerId: string, bodyId: string): void;
  bodyPositions(): BodyPosition[];
  canSee(viewer: Actor, x: number, z: number): boolean;
}

abstract class BotBrain {
  static readonly ARRIVE_DISTANCE = 0.6;
  static readonly SPEED_FACTOR = 0.85;

  readonly voteDelayMs: number;
  protected path: WorldPoint[] = [];
  protected busyUntilMs = 0;

  constructor(readonly actor: Actor, protected readonly world: BotWorld) {
    this.voteDelayMs = 3000 + world.random() * 9000;
  }

  step(deltaSeconds: number, nowMs: number): void {
    if (nowMs < this.busyUntilMs) {
      this.actor.moving = false;
      return;
    }
    this.decide(nowMs);
    this.follow(deltaSeconds);
  }

  resetAfterMeeting(nowMs: number): void {
    this.path = [];
    this.busyUntilMs = nowMs + 1000 + this.world.random() * 2000;
  }

  abstract chooseVote(candidates: string[]): string;

  protected abstract decide(nowMs: number): void;

  protected goTo(point: WorldPoint): void {
    this.path = this.world.map.findPath({ x: this.actor.x, z: this.actor.z }, point);
  }

  protected distanceTo(point: WorldPoint): number {
    return Mathx.distance(this.actor.x, this.actor.z, point.x, point.z);
  }

  protected wander(nowMs: number): void {
    if (this.path.length) return;
    const map = this.world.map;
    for (let attempt = 0; attempt < 20; attempt++) {
      const column = 1 + Math.floor(this.world.random() * (map.columns - 2)), row = 1 + Math.floor(this.world.random() * (map.rowCount - 2));
      if (map.isWallCell(column, row)) continue;
      this.goTo(map.cellCenter(column, row));
      this.busyUntilMs = nowMs + this.world.random() * 1500;
      return;
    }
  }

  protected pickVote(candidates: string[], skipChance: number): string {
    if (!candidates.length || this.world.random() < skipChance) return CastleSpyConfig.VOTE_SKIP;
    return candidates[Math.floor(this.world.random() * candidates.length)];
  }

  private follow(deltaSeconds: number): void {
    if (!this.path.length) {
      this.actor.moving = false;
      return;
    }
    const target = this.path[0];
    const deltaX = target.x - this.actor.x, deltaZ = target.z - this.actor.z;
    const length = Math.hypot(deltaX, deltaZ);
    if (length < BotBrain.ARRIVE_DISTANCE) {
      this.path.shift();
      return;
    }
    const step = Math.min(length, CastleSpyConfig.MOVE_SPEED * BotBrain.SPEED_FACTOR * deltaSeconds);
    const moved = this.actor.alive
      ? this.world.map.move(this.actor.x, this.actor.z, (deltaX / length) * step, (deltaZ / length) * step, CastleSpyConfig.PLAYER_RADIUS)
      : { x: this.actor.x + (deltaX / length) * step, z: this.actor.z + (deltaZ / length) * step };
    this.actor.moving = true;
    this.actor.yaw = Math.atan2(deltaX, deltaZ);
    this.actor.x = moved.x;
    this.actor.z = moved.z;
  }
}

class HeroBotBrain extends BotBrain {
  private static readonly BODY_NOTICE_RANGE = 9;
  private static readonly REPORT_CHANCE = 0.75;

  private currentTask: number | null = null;
  private workingSinceMs = 0;
  private consideredBodies = new Set<string>();
  private bodyTarget: BodyPosition | null = null;

  chooseVote(candidates: string[]): string {
    return this.pickVote(candidates, 0.3);
  }

  protected decide(nowMs: number): void {
    if (this.actor.alive && this.reactToBodies()) return;
    this.doTasks(nowMs);
  }

  private reactToBodies(): boolean {
    if (!this.bodyTarget) {
      for (const body of this.world.bodyPositions()) {
        if (this.consideredBodies.has(body.id)) continue;
        if (Mathx.distance(this.actor.x, this.actor.z, body.x, body.z) > HeroBotBrain.BODY_NOTICE_RANGE || !this.world.canSee(this.actor, body.x, body.z)) continue;
        this.consideredBodies.add(body.id);
        if (this.world.random() < HeroBotBrain.REPORT_CHANCE) {
          this.bodyTarget = body;
          this.goTo({ x: body.x, z: body.z });
        }
        break;
      }
    }
    if (!this.bodyTarget) return false;
    if (this.distanceTo(this.bodyTarget) <= CastleSpyConfig.REPORT_RANGE - 0.8) {
      this.world.reportBy(this.actor.id, this.bodyTarget.id);
      this.bodyTarget = null;
      this.path = [];
    }
    return true;
  }

  private doTasks(nowMs: number): void {
    if (this.currentTask === null) {
      const next = this.world.assignedTasks(this.actor.id).filter((index) => !this.world.isTaskDone(this.actor.id, index))[0];
      if (next === undefined) {
        this.wander(nowMs);
        return;
      }
      this.currentTask = next;
      this.workingSinceMs = 0;
      this.goTo(this.world.map.taskPosition(next));
      return;
    }
    const position = this.world.map.taskPosition(this.currentTask);
    if (this.distanceTo(position) > CastleSpyConfig.TASK_RANGE - 0.6) {
      if (!this.path.length) this.goTo(position);
      return;
    }
    if (!this.workingSinceMs) {
      this.workingSinceMs = nowMs;
      this.busyUntilMs = nowMs + 2500 + this.world.random() * 2000;
      this.actor.playAction(Actor.CLIP_WORK, 1500, nowMs);
      return;
    }
    this.world.completeTask(this.actor.id, this.currentTask);
    this.currentTask = null;
  }

  resetAfterMeeting(nowMs: number): void {
    super.resetAfterMeeting(nowMs);
    this.bodyTarget = null;
    this.currentTask = null;
  }
}

class SpyBotBrain extends BotBrain {
  private static readonly WITNESS_RANGE = 9;
  private static readonly WITNESS_SKIP_CHANCE = 0.85;

  private killReadyAtMs: number;
  private repathAtMs = 0;
  private nextWitnessCheckMs = 0;
  private witnessBlocked = false;

  chooseVote(candidates: string[]): string {
    const heroes = candidates.filter((id) => this.world.roleOf(id) !== "spy");
    return this.pickVote(heroes, 0.4);
  }

  constructor(actor: Actor, world: BotWorld, firstKillAtMs: number) {
    super(actor, world);
    this.killReadyAtMs = firstKillAtMs;
  }

  protected decide(nowMs: number): void {
    if (nowMs >= this.killReadyAtMs && this.hunt(nowMs)) return;
    this.pretendToWork(nowMs);
  }

  private nearestHero(): Actor | null {
    let best: Actor | null = null, bestDistance = Infinity;
    this.world.actorList().forEach((other) => {
      if (other === this.actor || !other.alive || this.world.roleOf(other.id) === "spy") return;
      const distance = Mathx.distance(this.actor.x, this.actor.z, other.x, other.z);
      if (distance < bestDistance) { best = other; bestDistance = distance; }
    });
    return best;
  }

  private hasWitness(victim: Actor): boolean {
    return this.world.actorList().some((other) =>
      other !== this.actor && other !== victim && other.alive &&
      Mathx.distance(other.x, other.z, victim.x, victim.z) <= SpyBotBrain.WITNESS_RANGE &&
      this.world.canSee(other, victim.x, victim.z)
    );
  }

  private hunt(nowMs: number): boolean {
    const victim = this.nearestHero();
    if (!victim) return false;
    if (nowMs >= this.repathAtMs) {
      this.goTo({ x: victim.x, z: victim.z });
      this.repathAtMs = nowMs + 600;
    }
    if (Mathx.distance(this.actor.x, this.actor.z, victim.x, victim.z) > CastleSpyConfig.KILL_RANGE - 0.4) return true;
    if (nowMs >= this.nextWitnessCheckMs) {
      this.witnessBlocked = this.hasWitness(victim) && this.world.random() < SpyBotBrain.WITNESS_SKIP_CHANCE;
      this.nextWitnessCheckMs = nowMs + 1000;
    }
    if (this.witnessBlocked) return true;
    this.world.killBy(this.actor.id, victim.id);
    this.actor.playAction(Actor.CLIP_STAB, 700, nowMs);
    this.killReadyAtMs = nowMs + CastleSpyConfig.KILL_COOLDOWN_MS;
    this.path = [];
    this.busyUntilMs = nowMs + 900;
    return true;
  }

  private pretendToWork(nowMs: number): void {
    if (this.path.length) return;
    const tasks = this.world.map.definition.tasks;
    this.goTo(this.world.map.taskPosition(Math.floor(this.world.random() * tasks.length)));
    this.busyUntilMs = nowMs + 1500 + this.world.random() * 2500;
  }

  resetAfterMeeting(nowMs: number): void {
    super.resetAfterMeeting(nowMs);
    this.killReadyAtMs = nowMs + CastleSpyConfig.KILL_COOLDOWN_MS;
  }
}

class BotFactory {
  static create(role: Role, actor: Actor, world: BotWorld, firstKillAtMs: number): BotBrain {
    return role === "spy" ? new SpyBotBrain(actor, world, firstKillAtMs) : new HeroBotBrain(actor, world);
  }
}

interface MatchServices {
  libs: ThreeLibs;
  assets: CharacterAssets;
  factory: CharacterModelFactory;
  scenery: SceneryAssets;
  labels: LabelFactory;
  world: WorldView;
  hud: Hud;
  meetingView: MeetingView;
  input: InputController;
  backend: Backend;
  taskOverlay: HTMLElement;
}

type MatchPhase = "reveal" | "play" | "meeting" | "ended";

class Match implements BotWorld {
  private static readonly HOST_TICK_MS = 500;
  private static readonly EMERGENCY_GAP_AFTER_MEETING_MS = 10000;

  readonly map: GameMap;
  readonly random: () => number;
  private readonly mapView: MapView;
  private readonly actors = new Map<string, Actor>();
  private readonly bodies = new Map<string, BodyView>();
  private readonly brains = new Map<string, BotBrain>();
  private readonly fakeDone = new Set<number>();
  private readonly me: Actor | null;
  private readonly startAtMs: number;
  private phase: MatchPhase = "reveal";
  private activeTask: TaskGame | null = null;
  private killReadyAtMs: number;
  private emergencyReadyAtMs: number;
  private finishedMeetings = 0;
  private resultWrittenFor = 0;
  private lastNetMs = 0;
  private lastSentRaw = "";
  private lastHostTickMs = 0;
  private lastProgressRaw = "";
  private revealShown = false;
  private disposed = false;

  constructor(private readonly s: MatchServices, private readonly session: RoomSession) {
    const match = session.match as MatchRecord;
    this.map = new GameMap(MapCatalog.byId(match.mapId));
    this.random = Mathx.seededRandom(match.id + 17);
    this.startAtMs = match.startAt;
    this.killReadyAtMs = match.startAt + CastleSpyConfig.FIRST_KILL_DELAY_MS;
    this.emergencyReadyAtMs = match.startAt + CastleSpyConfig.EMERGENCY_UNLOCK_MS;
    this.mapView = new MapView(s.libs, s.scenery, s.labels, this.map);
    s.world.world.add(this.mapView.group);
    this.buildActors(match);
    this.me = this.actors.get(session.myId) || null;
    s.input.enabled = true;
    s.world.snapCamera();
    s.hud.setProgress(0, 0);
    this.refreshTaskHud();
    this.syncDeaths();
    this.adoptBotsIfHost();
    s.input.onUse = () => this.useAction();
    s.input.onReport = () => this.reportAction();
    s.input.onKill = () => this.killAction();
    s.meetingView.onVote = (target) => this.castVote(target);
  }

  applyChange(kind: ChangeKind): void {
    if (this.disposed) return;
    if (kind === "players") this.dropLeftPlayers();
    else if (kind === "roles") this.rolesChanged();
    else if (kind === "tasks" || kind === "done" || kind === "progress") this.refreshTaskHud();
    else if (kind === "dead" || kind === "out") this.syncDeaths();
    else if (kind === "host") this.adoptBotsIfHost();
  }

  receiveRemote(id: string, state: RemoteState): void {
    const actor = this.actors.get(id);
    if (actor && !this.isLocalActor(actor)) actor.receiveRemote(state.x, state.z, state.yaw, state.moving);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const nowMs = this.s.backend.now();
    this.mapView.update(nowMs / 1000);
    this.showRoleRevealOnce();
    if (this.phase === "reveal" && nowMs >= this.startAtMs) this.phase = "play";
    this.driveMeeting(nowMs);
    if (this.phase === "play") {
      this.moveLocal(deltaSeconds);
      this.updateBots(deltaSeconds, nowMs);
      this.updateInteractions(nowMs);
    }
    if (this.activeTask) this.activeTask.update(deltaSeconds);
    this.sendState(nowMs);
    this.hostTick(nowMs);
    this.renderActors(deltaSeconds, nowMs);
    if (this.me) this.s.world.follow(this.me.x, this.me.z, deltaSeconds);
    this.s.world.render(deltaSeconds);
  }

  dispose(): void {
    this.disposed = true;
    if (this.activeTask) this.activeTask.abandon();
    this.actors.forEach((actor) => actor.dispose(this.s.world.world));
    this.bodies.forEach((body) => body.dispose());
    this.actors.clear();
    this.bodies.clear();
    this.s.world.world.remove(this.mapView.group);
    this.mapView.dispose();
    this.s.meetingView.close();
    this.s.input.releaseAll();
    this.s.input.onUse = this.s.input.onReport = this.s.input.onKill = () => undefined;
  }

  actorList(): Actor[] {
    return Array.from(this.actors.values());
  }

  isAlive(id: string): boolean {
    return this.session.isAlive(id);
  }

  roleOf(id: string): Role | null {
    return this.session.roles[id] || null;
  }

  assignedTasks(id: string): number[] {
    return this.session.tasks[id] || [];
  }

  isTaskDone(id: string, taskIndex: number): boolean {
    return this.session.done[taskIndex + "_" + id] !== undefined;
  }

  completeTask(id: string, taskIndex: number): void {
    const key = taskIndex + "_" + id;
    this.session.done[key] = this.s.backend.now();
    this.session.ref.child("done/" + key).set(this.session.done[key]);
    this.refreshTaskHud();
  }

  killBy(spyId: string, victimId: string): void {
    const victim = this.actors.get(victimId);
    if (!victim || !victim.alive) return;
    const record: DeadRecord = { t: this.s.backend.now(), x: victim.x, z: victim.z, n: this.finishedMeetings };
    this.session.dead[victimId] = record;
    this.session.ref.child("dead/" + victimId).set(record);
    this.syncDeaths();
  }

  reportBy(callerId: string, bodyId: string): void {
    this.callMeeting("report", callerId, bodyId);
  }

  bodyPositions(): BodyPosition[] {
    return Array.from(this.bodies.entries()).map(([id, body]) => ({ id, x: body.x, z: body.z }));
  }

  canSee(viewer: Actor, x: number, z: number): boolean {
    return Mathx.distance(viewer.x, viewer.z, x, z) <= CastleSpyConfig.VISION_RADIUS && this.map.hasLineOfSight(viewer.x, viewer.z, x, z);
  }

  private participantIds(): string[] {
    return (this.session.match as MatchRecord).order.filter((id) => this.session.players.has(id));
  }

  private myRole(): Role | null {
    return this.session.roles[this.session.myId] || null;
  }

  private isLocalActor(actor: Actor): boolean {
    return actor === this.me || (this.session.isHost() && actor.record.isBot);
  }

  private buildActors(match: MatchRecord): void {
    const ids = match.order.filter((id) => this.session.players.has(id));
    ids.forEach((id, index) => {
      const actor = new Actor(this.s.libs, this.s.factory, this.s.assets, this.s.labels, this.s.world.world, id, this.session.players.get(id) as PlayerRecord);
      const spawn = this.map.spawnPoint(index, ids.length);
      actor.placeAt(spawn.x, spawn.z);
      this.actors.set(id, actor);
    });
  }

  private adoptBotsIfHost(): void {
    if (!this.session.isHost()) {
      this.brains.clear();
      return;
    }
    if (!Object.keys(this.session.roles).some((id) => id !== this.session.myId)) this.session.loadAllRoles().then(() => this.adoptBotsIfHost());
    this.actors.forEach((actor, id) => {
      const role = this.roleOf(id);
      if (actor.record.isBot && role && !this.brains.has(id)) this.brains.set(id, BotFactory.create(role, actor, this, this.startAtMs + CastleSpyConfig.FIRST_KILL_DELAY_MS));
    });
  }

  private dropLeftPlayers(): void {
    this.actors.forEach((actor, id) => {
      if (this.session.players.has(id)) return;
      actor.dispose(this.s.world.world);
      this.actors.delete(id);
      this.brains.delete(id);
      if (this.session.isHost() && !this.session.dead[id] && this.session.out[id] === undefined) {
        const record: DeadRecord = { t: this.s.backend.now(), x: actor.x, z: actor.z, n: this.finishedMeetings, left: 1 };
        this.session.ref.child("dead/" + id).set(record);
      }
    });
  }

  private rolesChanged(): void {
    const role = this.myRole();
    this.s.hud.setRole(role);
    if (this.me) this.me.role = role;
    this.refreshTaskHud();
    this.adoptBotsIfHost();
  }

  private showRoleRevealOnce(): void {
    const role = this.myRole();
    if (this.revealShown || !role || this.phase !== "reveal") return;
    this.revealShown = true;
    this.s.hud.setRole(role);
    const partners = role === "spy" ? this.participantIds().filter((id) => id !== this.session.myId && this.roleOf(id) === "spy").map((id) => (this.session.players.get(id) as PlayerRecord).nick) : [];
    this.s.hud.showRoleReveal(role, partners, Math.max(1500, this.startAtMs - this.s.backend.now()));
  }

  private pendingTasksOfMe(): number[] {
    const id = this.session.myId;
    return this.assignedTasks(id).filter((index) => !(this.myRole() === "spy" ? this.fakeDone.has(index) : this.isTaskDone(id, index)));
  }

  private refreshTaskHud(): void {
    const id = this.session.myId, isSpy = this.myRole() === "spy";
    const items = this.assignedTasks(id).map((index) => {
      const spot = this.map.definition.tasks[index];
      return { title: spot.title, room: spot.roomName, done: isSpy ? this.fakeDone.has(index) : this.isTaskDone(id, index) };
    });
    this.s.hud.setTasks(items, isSpy);
    this.mapView.showTasks(new Set(this.pendingTasksOfMe()));
    const progress = this.session.progress || { done: 0, total: 0 };
    this.s.hud.setProgress(progress.done, progress.total);
  }

  private syncDeaths(): void {
    const meetingCount = this.session.meeting ? this.session.meeting.n : 0;
    this.actors.forEach((actor, id) => {
      const gone = !!this.session.dead[id] || this.session.out[id] !== undefined;
      if (gone && actor.alive) {
        actor.alive = false;
        if (id === this.session.myId) this.onMyDeath();
      }
    });
    Object.keys(this.session.dead).forEach((id) => {
      const record = this.session.dead[id];
      const wanted = !record.left && record.n === meetingCount && this.session.players.has(id);
      const shown = this.bodies.get(id);
      if (wanted && !shown) {
        this.bodies.set(id, new BodyView(this.s.libs, this.s.factory, this.s.assets, this.s.world.world, this.session.players.get(id) as PlayerRecord, record.x, record.z));
      } else if (!wanted && shown) {
        shown.dispose();
        this.bodies.delete(id);
      }
    });
    this.bodies.forEach((body, id) => {
      if (!this.session.dead[id]) {
        body.dispose();
        this.bodies.delete(id);
      }
    });
  }

  private onMyDeath(): void {
    if (this.activeTask) this.activeTask.abandon();
    this.s.hud.showBanner("당했어요! 유령이 되어 남은 할 일을 도울 수 있어요", 4500);
  }

  private moveLocal(deltaSeconds: number): void {
    const me = this.me;
    if (!me) return;
    const axis = this.s.input.axis();
    const length = Math.hypot(axis.x, axis.z);
    me.moving = length > 0.05 && !this.activeTask;
    if (!me.moving) return;
    const speed = CastleSpyConfig.MOVE_SPEED * Math.min(1, length) * (me.alive ? 1 : 1.15);
    const deltaX = (axis.x / length) * speed * deltaSeconds, deltaZ = (axis.z / length) * speed * deltaSeconds;
    if (me.alive) {
      const moved = this.map.move(me.x, me.z, deltaX, deltaZ, CastleSpyConfig.PLAYER_RADIUS);
      me.x = moved.x;
      me.z = moved.z;
    } else {
      me.x = Mathx.clamp(me.x + deltaX, this.map.worldX(1), this.map.worldX(this.map.columns - 1));
      me.z = Mathx.clamp(me.z + deltaZ, this.map.worldZ(1), this.map.worldZ(this.map.rowCount - 1));
    }
    me.yaw = Math.atan2(deltaX, deltaZ);
  }

  private updateBots(deltaSeconds: number, nowMs: number): void {
    if (!this.session.isHost()) return;
    this.brains.forEach((brain) => {
      if (brain.actor.alive || this.roleOf(brain.actor.id) === "hero") brain.step(deltaSeconds, nowMs);
    });
  }

  private nearestPendingTask(): number | null {
    const me = this.me;
    if (!me) return null;
    let best: number | null = null, bestDistance: number = CastleSpyConfig.TASK_RANGE;
    this.pendingTasksOfMe().forEach((index) => {
      const position = this.map.taskPosition(index);
      const distance = Mathx.distance(me.x, me.z, position.x, position.z);
      if (distance <= bestDistance) { best = index; bestDistance = distance; }
    });
    return best;
  }

  private nearTable(): boolean {
    const me = this.me;
    if (!me) return false;
    const table = this.map.tablePosition();
    return Mathx.distance(me.x, me.z, table.x, table.z) <= CastleSpyConfig.TABLE_RANGE;
  }

  private emergencyAvailable(nowMs: number): boolean {
    const me = this.me;
    return !!me && me.alive && !this.session.buttonUsed[this.session.myId] && nowMs >= this.emergencyReadyAtMs && this.nearTable();
  }

  private nearestBodyInReach(): string | null {
    const me = this.me;
    if (!me || !me.alive) return null;
    let best: string | null = null, bestDistance: number = CastleSpyConfig.REPORT_RANGE;
    this.bodies.forEach((body, id) => {
      const distance = Mathx.distance(me.x, me.z, body.x, body.z);
      if (distance <= bestDistance && this.map.hasLineOfSight(me.x, me.z, body.x, body.z)) { best = id; bestDistance = distance; }
    });
    return best;
  }

  private killTargetInReach(): Actor | null {
    const me = this.me;
    if (!me || !me.alive || this.myRole() !== "spy") return null;
    let best: Actor | null = null, bestDistance: number = CastleSpyConfig.KILL_RANGE;
    this.actors.forEach((actor) => {
      if (actor === me || !actor.alive || this.roleOf(actor.id) === "spy") return;
      const distance = Mathx.distance(me.x, me.z, actor.x, actor.z);
      if (distance <= bestDistance) { best = actor; bestDistance = distance; }
    });
    return best;
  }

  private updateInteractions(nowMs: number): void {
    const hud = this.s.hud;
    if (this.activeTask || !this.me) {
      hud.setUseLabel(null);
      hud.setReportVisible(false);
      hud.setKill(false, false, 0);
      return;
    }
    const task = this.nearestPendingTask();
    hud.setUseLabel(task !== null ? "할 일" : this.emergencyAvailable(nowMs) ? "긴급 회의" : null);
    hud.setReportVisible(this.nearestBodyInReach() !== null);
    const isSpy = this.myRole() === "spy" && this.me.alive;
    const cooldown = CastleSpyConfig.KILL_COOLDOWN_MS;
    const ready = nowMs >= this.killReadyAtMs && this.killTargetInReach() !== null;
    hud.setKill(isSpy, ready, Mathx.clamp((this.killReadyAtMs - nowMs) / cooldown, 0, 1));
  }

  private useAction(): void {
    if (this.phase !== "play" || this.activeTask || !this.me) return;
    const nowMs = this.s.backend.now();
    const task = this.nearestPendingTask();
    if (task !== null) {
      const spot = this.map.definition.tasks[task];
      this.s.input.releaseAll();
      this.me.moving = false;
      this.activeTask = TaskGameCatalog.create(spot.kind, this.s.taskOverlay, spot.roomName + " · " + spot.title, (completed) => this.taskFinished(task, completed));
      this.activeTask.open();
    } else if (this.emergencyAvailable(nowMs)) {
      this.session.buttonUsed[this.session.myId] = true;
      this.session.ref.child("buttonUsed/" + this.session.myId).set(true);
      this.callMeeting("button", this.session.myId, null);
    }
  }

  private taskFinished(taskIndex: number, completed: boolean): void {
    this.activeTask = null;
    if (!completed) return;
    if (this.myRole() === "spy") {
      this.fakeDone.add(taskIndex);
      this.refreshTaskHud();
    } else {
      this.completeTask(this.session.myId, taskIndex);
    }
  }

  private reportAction(): void {
    if (this.phase !== "play" || this.activeTask) return;
    const body = this.nearestBodyInReach();
    if (body) this.callMeeting("report", this.session.myId, body);
  }

  private killAction(): void {
    if (this.phase !== "play" || this.activeTask || !this.me) return;
    const nowMs = this.s.backend.now();
    const target = this.killTargetInReach();
    if (!target || nowMs < this.killReadyAtMs) return;
    this.killBy(this.session.myId, target.id);
    this.me.playAction(Actor.CLIP_STAB, 700, nowMs);
    this.killReadyAtMs = nowMs + CastleSpyConfig.KILL_COOLDOWN_MS;
  }

  private callMeeting(kind: "report" | "button", callerId: string, bodyId: string | null): void {
    if (this.phase !== "play") return;
    const nextNumber = (this.session.meeting ? this.session.meeting.n : 0) + 1;
    const record: MeetingRecord = { n: nextNumber, kind, caller: callerId, body: bodyId, at: this.s.backend.now() };
    this.session.ref.child("meeting").transaction((current) => {
      const existing = current as MeetingRecord | null;
      return existing && existing.n >= nextNumber ? undefined : record;
    });
  }

  private meetingPhase(nowMs: number): MeetingPhase | "finished" {
    const meeting = this.session.meeting;
    if (!meeting || meeting.n <= this.finishedMeetings || this.session.status !== "play") return "none";
    const result = this.session.result;
    if (result && result.n === meeting.n) return nowMs < result.at + CastleSpyConfig.RESULT_MS ? "result" : "finished";
    return nowMs < meeting.at + CastleSpyConfig.TALK_MS ? "talk" : "vote";
  }

  private driveMeeting(nowMs: number): void {
    const meeting = this.session.meeting;
    const phase = this.meetingPhase(nowMs);
    if (phase === "none") return;
    if (phase === "finished") {
      this.leaveMeeting(nowMs);
      return;
    }
    if (this.phase !== "meeting" && this.phase !== "ended") this.enterMeeting();
    if (this.phase !== "meeting" || !meeting) return;
    this.hostCountVotes(nowMs, meeting, phase);
    this.renderMeeting(nowMs, meeting, phase);
  }

  private enterMeeting(): void {
    this.phase = "meeting";
    if (this.activeTask) this.activeTask.abandon();
    this.s.input.releaseAll();
    this.s.input.enabled = false;
    if (this.me) this.me.moving = false;
    this.s.hud.setUseLabel(null);
    this.s.hud.setReportVisible(false);
    this.s.hud.setKill(false, false, 0);
    this.s.meetingView.open();
  }

  private leaveMeeting(nowMs: number): void {
    const meeting = this.session.meeting as MeetingRecord;
    this.finishedMeetings = meeting.n;
    if (this.phase === "meeting") this.phase = "play";
    this.s.input.enabled = true;
    this.s.meetingView.close();
    const alive = this.participantIds().filter((id) => this.actors.has(id) && this.session.isAlive(id));
    alive.forEach((id, index) => {
      const spawn = this.map.spawnPoint(index, alive.length);
      (this.actors.get(id) as Actor).placeAt(spawn.x, spawn.z);
    });
    this.s.world.snapCamera();
    this.killReadyAtMs = nowMs + CastleSpyConfig.KILL_COOLDOWN_MS;
    this.emergencyReadyAtMs = nowMs + Match.EMERGENCY_GAP_AFTER_MEETING_MS;
    this.brains.forEach((brain) => brain.resetAfterMeeting(nowMs));
    this.syncDeaths();
    if (this.session.out[this.session.myId] !== undefined) this.s.hud.showBanner("추방되었어요. 유령이 되어 할 일을 도울 수 있어요", 4500);
    this.hostCheckWin();
  }

  private votesOf(meetingNumber: number): Record<string, string> {
    return this.session.votes[String(meetingNumber)] || {};
  }

  private hostCountVotes(nowMs: number, meeting: MeetingRecord, phase: MeetingPhase): void {
    if (!this.session.isHost() || phase !== "vote" || this.resultWrittenFor >= meeting.n) return;
    const votes = this.votesOf(meeting.n);
    const aliveIds = this.participantIds().filter((id) => this.session.isAlive(id));
    const voteStartMs = meeting.at + CastleSpyConfig.TALK_MS;
    this.brains.forEach((brain, id) => {
      if (this.session.isAlive(id) && !votes[id] && nowMs >= voteStartMs + brain.voteDelayMs) {
        const candidates = aliveIds.filter((other) => other !== id);
        const choice = brain.chooseVote(candidates);
        votes[id] = choice;
        this.session.ref.child("votes/" + meeting.n + "/" + id).set(choice);
      }
    });
    const everyoneVoted = aliveIds.every((id) => !!votes[id]);
    if (!everyoneVoted && nowMs < voteStartMs + CastleSpyConfig.VOTE_MS) return;
    this.resultWrittenFor = meeting.n;
    const tally = MatchRules.tally(votes, aliveIds);
    const ejected = tally.ejected;
    const result: ResultRecord = { n: meeting.n, ejected, wasSpy: !!ejected && this.roleOf(ejected) === "spy", at: nowMs, counts: tally.counts };
    const updates: Record<string, unknown> = { result };
    if (ejected) updates["out/" + ejected] = meeting.n;
    this.session.ref.update(updates);
  }

  private castVote(target: string): void {
    const meeting = this.session.meeting;
    const me = this.me;
    if (this.phase !== "meeting" || !meeting || !me || !me.alive) return;
    const nowMs = this.s.backend.now();
    if (this.meetingPhase(nowMs) !== "vote") return;
    const votes = this.votesOf(meeting.n);
    if (votes[this.session.myId]) return;
    if (target !== CastleSpyConfig.VOTE_SKIP && !this.session.isAlive(target)) return;
    if (!this.session.votes[String(meeting.n)]) this.session.votes[String(meeting.n)] = {};
    this.session.votes[String(meeting.n)][this.session.myId] = target;
    this.session.ref.child("votes/" + meeting.n + "/" + this.session.myId).set(target);
  }

  private renderMeeting(nowMs: number, meeting: MeetingRecord, phase: MeetingPhase): void {
    const votes = this.votesOf(meeting.n);
    const result = this.session.result && this.session.result.n === meeting.n ? this.session.result : null;
    const callerNick = (this.session.players.get(meeting.caller) || { nick: "누군가" }).nick;
    const bodyNick = meeting.body ? (this.session.players.get(meeting.body) || { nick: "누군가" }).nick : "";
    const title = meeting.kind === "report" ? callerNick + "님이 " + bodyNick + "님의 시체를 발견했어요!" : callerNick + "님이 긴급 회의를 열었어요!";
    const me = this.me;
    const cards: MeetingCard[] = (this.session.match as MatchRecord).order.filter((id) => this.session.players.has(id)).map((id) => {
      const record = this.session.players.get(id) as PlayerRecord;
      const alive = this.session.isAlive(id);
      return {
        id,
        nick: record.nick,
        color: CastleSpyConfig.SLOT_COLORS[record.slot % CastleSpyConfig.SLOT_COLORS.length],
        alive,
        voted: !!votes[id] && alive,
        votesReceived: result ? result.counts[id] || 0 : 0
      };
    });
    let secondsLeft = 0, resultText = "";
    if (phase === "talk") secondsLeft = (meeting.at + CastleSpyConfig.TALK_MS - nowMs) / 1000;
    else if (phase === "vote") secondsLeft = (meeting.at + CastleSpyConfig.TALK_MS + CastleSpyConfig.VOTE_MS - nowMs) / 1000;
    else if (result) {
      secondsLeft = (result.at + CastleSpyConfig.RESULT_MS - nowMs) / 1000;
      const ejectedNick = result.ejected ? (this.session.players.get(result.ejected) || { nick: "누군가" }).nick : "";
      resultText = result.ejected
        ? ejectedNick + "님이 추방되었어요. " + (result.wasSpy ? "스파이였어요!" : "스파이가 아니었어요…")
        : "아무도 추방되지 않았어요.";
    }
    this.s.meetingView.render({
      title,
      phase,
      secondsLeft,
      cards,
      myVote: votes[this.session.myId] || null,
      canVote: phase === "vote" && !!me && me.alive,
      skipVotes: result ? result.counts[CastleSpyConfig.VOTE_SKIP] || 0 : 0,
      resultText
    });
  }

  private sendState(nowMs: number): void {
    const me = this.me;
    if (!me || nowMs - this.lastNetMs < CastleSpyConfig.NET_MS) return;
    this.lastNetMs = nowMs;
    this.writeStateOf(me, true);
    if (this.session.isHost()) this.brains.forEach((brain) => this.writeStateOf(brain.actor, false));
  }

  private writeStateOf(actor: Actor, mine: boolean): void {
    const raw = StateCodec.encode(actor.x, actor.z, actor.yaw, actor.moving);
    if (mine) {
      if (raw === this.lastSentRaw && Math.random() > 0.1) return;
      this.lastSentRaw = raw;
      this.session.writeState(raw);
    } else {
      this.session.ref.child("st/" + actor.id).set(raw);
    }
  }

  private taskProgress(): TaskProgress {
    let done = 0, total = 0;
    this.participantIds().forEach((id) => {
      if (this.roleOf(id) !== "hero") return;
      const tasks = this.assignedTasks(id);
      total += tasks.length;
      tasks.forEach((index) => { if (this.isTaskDone(id, index)) done++; });
    });
    return { done, total };
  }

  private hostTick(nowMs: number): void {
    if (!this.session.isHost() || this.phase === "ended" || nowMs - this.lastHostTickMs < Match.HOST_TICK_MS) return;
    this.lastHostTickMs = nowMs;
    const progress = this.taskProgress();
    const raw = progress.done + "/" + progress.total;
    if (raw !== this.lastProgressRaw && progress.total > 0) {
      this.lastProgressRaw = raw;
      this.session.ref.child("progress").set(progress);
    }
    if (this.phase === "play") this.hostCheckWin();
  }

  private hostCheckWin(): void {
    if (!this.session.isHost() || this.session.status !== "play" || this.phase === "ended") return;
    const ids = this.participantIds();
    if (ids.some((id) => this.roleOf(id) === null)) return;
    const aliveHeroes = ids.filter((id) => this.roleOf(id) === "hero" && this.session.isAlive(id)).length;
    const aliveSpies = ids.filter((id) => this.roleOf(id) === "spy" && this.session.isAlive(id)).length;
    const progress = this.taskProgress();
    const verdict = MatchRules.winner(aliveHeroes, aliveSpies, progress.done, progress.total);
    if (!verdict) return;
    const spies = ids.filter((id) => this.roleOf(id) === "spy");
    const end: EndRecord = { winner: verdict.winner, reason: verdict.reason, at: this.s.backend.now(), spies };
    this.session.ref.update({ status: "end", end });
  }

  markEnded(): void {
    this.phase = "ended";
    if (this.activeTask) this.activeTask.abandon();
    this.s.input.releaseAll();
    this.s.input.enabled = false;
    this.s.meetingView.close();
    this.s.hud.setUseLabel(null);
    this.s.hud.setReportVisible(false);
    this.s.hud.setKill(false, false, 0);
  }

  private renderActors(deltaSeconds: number, nowMs: number): void {
    const me = this.me;
    const viewerIsGhost = !me || !me.alive;
    this.actors.forEach((actor) => {
      if (!this.isLocalActor(actor)) actor.stepRemote(deltaSeconds);
      actor.setGhost(!actor.alive);
      if (actor === me) actor.setVisible(true);
      else if (viewerIsGhost) actor.setVisible(true);
      else actor.setVisible(actor.alive && this.canSee(me as Actor, actor.x, actor.z));
      actor.render(deltaSeconds, nowMs);
    });
    this.bodies.forEach((body) => {
      body.update(deltaSeconds);
      body.group.visible = viewerIsGhost || this.canSee(me as Actor, body.x, body.z);
    });
  }
}

type ScreenName = "start" | "lobby" | "game" | "end";

class ScreenManager {
  private readonly start = Dom.byId("startScreen");
  private readonly lobby = Dom.byId("lobbyScreen");
  private readonly end = Dom.byId("endScreen");
  private readonly gameUi = Dom.byId("gameUi");
  private readonly joystickZone = Dom.byId("joyZone");
  current: ScreenName = "start";

  constructor(private readonly touchDevice: boolean) {}

  show(name: ScreenName): void {
    this.current = name;
    Dom.show(this.start, name === "start");
    Dom.show(this.lobby, name === "lobby");
    Dom.show(this.end, name === "end");
    Dom.show(this.gameUi, name === "game");
    Dom.show(this.joystickZone, name === "game" && this.touchDevice);
  }
}

class LobbyView {
  private readonly code = Dom.byId("lobbyCode");
  private readonly playerBox = Dom.byId("lobbyPlayers");
  private readonly mapRow = Dom.byId("mapRow");
  private readonly mapOptions = Dom.byId("mapOpts");
  private readonly botRow = Dom.byId("botRow");
  private readonly startButton = Dom.byId<HTMLButtonElement>("btnStart");
  private readonly hint = Dom.byId("lobbyHint");
  onPickMap: (mapId: string) => void = () => undefined;

  constructor() {
    this.mapOptions.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest("button[data-map]") as HTMLButtonElement | null;
      if (button) this.onPickMap(button.dataset.map as string);
    });
  }

  render(session: RoomSession): void {
    const isHost = session.isHost();
    const count = session.players.size;
    Dom.setText(this.code, session.code);
    this.playerBox.innerHTML = session.order().map((id) => {
      const record = session.players.get(id) as PlayerRecord;
      const color = CastleSpyConfig.SLOT_COLORS[record.slot % CastleSpyConfig.SLOT_COLORS.length];
      const tag = id === session.hostId ? "방장" : record.isBot ? "AI" : "";
      return "<div class='plRow" + (id === session.myId ? " me" : "") + "'><i style='background:" + color + "'></i><b>" + Dom.escape(record.nick) + "</b><small>" + tag + "</small></div>";
    }).join("");
    Dom.show(this.botRow, isHost);
    Dom.show(this.mapRow, isHost && MapCatalog.ALL.length > 1);
    this.mapOptions.innerHTML = MapCatalog.ALL.map((definition) =>
      "<button type='button' data-map='" + definition.id + "' class='" + (definition.id === session.mapId ? "on" : "") + "'>" + Dom.escape(definition.name) + "</button>"
    ).join("");
    const enough = count >= CastleSpyConfig.MIN_PLAYERS;
    Dom.show(this.startButton, isHost);
    this.startButton.disabled = !enough;
    Dom.setText(this.hint, isHost
      ? (enough ? count + "명이 모였어요. 시작할 수 있어요!" : "최소 " + CastleSpyConfig.MIN_PLAYERS + "명이 필요해요. 친구를 기다리거나 AI를 추가하세요. (" + count + "/" + CastleSpyConfig.MAX_PLAYERS + ")")
      : "방장이 시작하길 기다리는 중이에요… (" + count + "/" + CastleSpyConfig.MAX_PLAYERS + ")");
  }
}

class EndView {
  private readonly title = Dom.byId("endTitle");
  private readonly reason = Dom.byId("endReason");
  private readonly rows = Dom.byId("endRows");
  private readonly toLobby = Dom.byId<HTMLButtonElement>("btnToLobby");
  private readonly hint = Dom.byId("endHint");

  render(session: RoomSession, end: EndRecord): void {
    const myRole: Role = end.spies.indexOf(session.myId) >= 0 ? "spy" : "hero";
    const mine = myRole === end.winner;
    Dom.setText(this.title, (end.winner === "hero" ? "용사 승리!" : "스파이 승리!") + (mine ? "  (내가 이겼어요)" : "  (아쉬워요)"));
    Dom.setText(this.reason, end.reason);
    const order = session.match ? session.match.order : session.order();
    this.rows.innerHTML = order.filter((id) => session.players.has(id)).map((id) => {
      const record = session.players.get(id) as PlayerRecord;
      const isSpy = end.spies.indexOf(id) >= 0;
      const fate = session.dead[id] ? (session.dead[id].left ? "나감" : "당함") : session.out[id] !== undefined ? "추방" : "생존";
      const color = CastleSpyConfig.SLOT_COLORS[record.slot % CastleSpyConfig.SLOT_COLORS.length];
      return "<tr" + (id === session.myId ? " class='meRow'" : "") + "><td><span class='rankDot' style='background:" + color + "'></span>" + Dom.escape(record.nick) + "</td>" +
        "<td><b>" + (isSpy ? "스파이" : "용사") + "</b></td><td>" + fate + "</td></tr>";
    }).join("");
    Dom.show(this.toLobby, session.isHost());
    Dom.setText(this.hint, session.isHost() ? "" : "방장이 대기실로 보내면 함께 돌아가요.");
  }
}

class MenuBackdrop {
  private static readonly ORBIT_SECONDS = 80;
  private static readonly RADIUS = 34;
  private static readonly HEIGHT = 30;

  private view: MapView | null = null;
  private map: GameMap | null = null;
  private seconds = 0;

  constructor(private readonly services: MatchServices) {}

  prepare(): void {
    if (this.view) return;
    this.map = new GameMap(MapCatalog.ALL[0]);
    this.view = new MapView(this.services.libs, this.services.scenery, this.services.labels, this.map);
    this.view.showTasks(new Set<number>());
    this.services.world.world.add(this.view.group);
  }

  render(deltaSeconds: number): void {
    const map = this.map;
    if (!this.view || !map) return;
    this.seconds += deltaSeconds;
    this.view.group.visible = true;
    this.view.update(this.seconds);
    const angle = this.seconds / MenuBackdrop.ORBIT_SECONDS * Math.PI * 2;
    this.services.world.orbit(map.columns * map.cell / 2, map.rowCount * map.cell / 2, MenuBackdrop.RADIUS, MenuBackdrop.HEIGHT, angle);
    this.services.world.render(deltaSeconds);
  }

  hide(): void {
    if (this.view) this.view.group.visible = false;
  }
}

class CastleSpyGame {
  private readonly backdrop: MenuBackdrop;
  private readonly touchDevice = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  private readonly profile = new PlayerProfile();
  private readonly backend = new Backend();
  private readonly directory = new RoomDirectory(this.backend);
  private readonly assets: CharacterAssets;
  private readonly factory: CharacterModelFactory;
  private readonly scenery: SceneryAssets;
  private readonly labels: LabelFactory;
  private readonly world: WorldView;
  private readonly services: MatchServices;
  private readonly screens = new ScreenManager(this.touchDevice);
  private readonly lobbyView = new LobbyView();
  private readonly endView = new EndView();
  private readonly editor: ProfileEditor;
  private readonly myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  private session: RoomSession | null = null;
  private match: Match | null = null;
  private assetsReady = false;
  private lastFrameMs = 0;

  constructor(private readonly libs: ThreeLibs) {
    this.assets = new CharacterAssets(libs);
    this.factory = new CharacterModelFactory(libs, this.assets);
    this.scenery = new SceneryAssets(libs);
    this.labels = new LabelFactory(libs);
    this.world = new WorldView(libs, Dom.byId<HTMLCanvasElement>("view"), this.touchDevice);
    this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
    FoldCard.bindAll(document);
    this.services = {
      libs,
      assets: this.assets,
      factory: this.factory,
      scenery: this.scenery,
      labels: this.labels,
      world: this.world,
      hud: new Hud(),
      meetingView: new MeetingView(),
      input: new InputController(Dom.byId("joyZone"), Dom.byId("joyBase"), Dom.byId("joyKnob")),
      backend: this.backend,
      taskOverlay: Dom.byId("taskOverlay")
    };
    this.backdrop = new MenuBackdrop(this.services);
    this.bindMenus();
    this.screens.show("start");
    this.updateStartButtons();
    this.loadAssets();
    requestAnimationFrame(this.loop);
    window.setInterval(() => { if (document.hidden) this.step(performance.now()); }, 250);
    window.addEventListener("pagehide", () => { if (this.session) this.session.removeMineOnUnload(); });
  }

  private async loadAssets(): Promise<void> {
    const modelNames = new Set<string>(SceneryAssets.DECOR_MODELS);
    MapCatalog.ALL.forEach((definition) => definition.props.forEach((prop) => modelNames.add(prop.model)));
    try {
      await Promise.all([this.assets.load(), this.scenery.load(Array.from(modelNames))]);
      this.assetsReady = true;
      this.backdrop.prepare();
      Dom.setText(Dom.byId("loadNote"), "");
      this.editor.mount(Dom.byId("profileHost"));
      this.editor.setActive(true);
      this.editor.onChange(() => this.pushProfile());
      this.updateStartButtons();
    } catch (error) {
      Dom.setText(Dom.byId("loadNote"), "캐릭터를 불러오지 못했어요. 새로고침해 주세요.");
    }
  }

  private bindMenus(): void {
    Dom.byId("btnCreate").addEventListener("click", () => this.createRoom());
    Dom.byId("btnJoin").addEventListener("click", () => this.joinRoom());
    Dom.byId("joinCode").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") this.joinRoom(); });
    Dom.byId("btnStart").addEventListener("click", () => this.startMatch());
    Dom.byId("btnLeave").addEventListener("click", () => this.leaveRoom());
    Dom.byId("btnEndLeave").addEventListener("click", () => this.leaveRoom());
    Dom.byId("btnToLobby").addEventListener("click", () => this.returnToLobby());
    Dom.byId("btnAddBot").addEventListener("click", () => this.addBot());
    Dom.byId("btnRemoveBot").addEventListener("click", () => this.removeBot());
    this.lobbyView.onPickMap = (mapId) => { if (this.session && this.session.isHost()) this.session.ref.update({ mapId }); };
  }

  private updateStartButtons(): void {
    const ok = !!this.backend.database && this.assetsReady;
    Dom.byId<HTMLButtonElement>("btnCreate").disabled = !ok;
    Dom.byId<HTMLButtonElement>("btnJoin").disabled = !ok;
    if (!this.backend.database) this.showStartMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
  }

  private showStartMessage(text: string): void {
    Dom.setText(Dom.byId("startMsg"), text);
  }

  private myRecord(): PlayerRecord {
    return { nick: this.profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: this.profile.look };
  }

  private pushProfile(): void {
    if (this.session) this.session.pushProfile({ nick: this.profile.nickOrDefault(), look: this.profile.look });
  }

  private async createRoom(): Promise<void> {
    if (!this.backend.database) return;
    this.showStartMessage("");
    const button = Dom.byId<HTMLButtonElement>("btnCreate");
    button.disabled = true;
    try {
      const code = await this.directory.create(this.myId, this.myRecord());
      if (code) this.enterRoom(code);
      else this.showStartMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
    } catch (error) {
      this.showStartMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
    button.disabled = false;
  }

  private async joinRoom(): Promise<void> {
    if (!this.backend.database) return;
    const code = Dom.byId<HTMLInputElement>("joinCode").value.replace(/\D/g, "");
    if (code.length !== 5) {
      this.showStartMessage("방 코드 5자리를 입력해 주세요.");
      return;
    }
    this.showStartMessage("");
    try {
      const outcome = await this.directory.join(code, this.myId, this.myRecord());
      if (outcome.ok) this.enterRoom(code);
      else this.showStartMessage(outcome.message);
    } catch (error) {
      this.showStartMessage("방을 불러오지 못했어요.");
    }
  }

  private enterRoom(code: string): void {
    const session = new RoomSession(this.backend, code, this.myId);
    this.session = session;
    session.onChange = (kind) => this.onSessionChange(kind);
    session.onRemoteState = (id, state) => { if (this.match) this.match.receiveRemote(id, state); };
    session.onClosed = (message) => this.exitToStart(message);
    session.connect();
    this.showLobby();
  }

  private showLobby(): void {
    this.screens.show("lobby");
    this.editor.mount(Dom.byId("lobbyProfileHost"));
    this.editor.setActive(true);
    if (this.session) this.lobbyView.render(this.session);
  }

  private showStart(message: string): void {
    this.screens.show("start");
    this.editor.mount(Dom.byId("profileHost"));
    this.editor.setActive(true);
    this.showStartMessage(message);
  }

  private onSessionChange(kind: ChangeKind): void {
    const session = this.session;
    if (!session) return;
    if (this.screens.current === "lobby" && (kind === "players" || kind === "host" || kind === "map" || kind === "status")) this.lobbyView.render(session);
    if (kind === "status" || kind === "match" || kind === "end") this.syncPhase();
    if (this.match) this.match.applyChange(kind);
  }

  private syncPhase(): void {
    const session = this.session;
    if (!session) return;
    if (session.status === "lobby") {
      if (this.match) this.disposeMatch();
      if (this.screens.current !== "lobby") this.showLobby();
      this.lobbyView.render(session);
    } else if (session.status === "play" && session.match && !this.match) {
      if (session.match.order.indexOf(session.myId) < 0) {
        this.exitToStart("이미 게임이 시작되어 들어갈 수 없어요.");
        return;
      }
      this.editor.setActive(false);
      this.match = new Match(this.services, session);
      this.screens.show("game");
    } else if (session.status === "end" && session.end && this.screens.current !== "end") {
      if (this.match) this.match.markEnded();
      this.endView.render(session, session.end);
      this.screens.show("end");
    }
  }

  private disposeMatch(): void {
    if (this.match) this.match.dispose();
    this.match = null;
  }

  private startMatch(): void {
    const session = this.session;
    if (!session || !session.isHost()) return;
    const ids = session.order();
    if (ids.length < CastleSpyConfig.MIN_PLAYERS || ids.length > CastleSpyConfig.MAX_PLAYERS) return;
    const definition = MapCatalog.byId(session.mapId);
    const seed = 1 + Math.floor(Math.random() * 1000000000);
    const random = Mathx.seededRandom(seed);
    const roles = MatchRules.assignRoles(ids, random);
    const tasks = MatchRules.assignTasks(ids, definition.tasks.length, CastleSpyConfig.TASKS_PER_PLAYER, random);
    const match: MatchRecord = { id: seed, startAt: this.backend.now() + CastleSpyConfig.ROLE_REVEAL_MS, mapId: definition.id, order: ids };
    Object.assign(session.roles, roles);
    session.ref.update({
      status: "play", match, roles, tasks,
      st: null, done: null, dead: null, out: null, buttonUsed: null, meeting: null, votes: null, result: null, end: null, progress: null
    });
  }

  private returnToLobby(): void {
    const session = this.session;
    if (!session || !session.isHost()) return;
    session.ref.update({
      status: "lobby", match: null, roles: null, tasks: null,
      st: null, done: null, dead: null, out: null, buttonUsed: null, meeting: null, votes: null, result: null, end: null, progress: null
    });
  }

  private addBot(): void {
    const session = this.session;
    if (!session || !session.isHost() || session.players.size >= CastleSpyConfig.MAX_PLAYERS) return;
    const usedNicks = new Set<string>();
    session.players.forEach((record) => usedNicks.add(record.nick));
    const nick = CastleSpyConfig.BOT_NAMES.filter((name) => !usedNicks.has(name))[0] || "AI";
    const record: PlayerRecord = { nick, isBot: true, joinedAt: this.backend.now() + 1, slot: session.freeSlot(), look: CharacterLooks.random() };
    session.ref.child("players/bot" + Math.random().toString(36).slice(2, 8)).set(record);
  }

  private removeBot(): void {
    const session = this.session;
    if (!session || !session.isHost()) return;
    const bots = session.order().filter((id) => (session.players.get(id) as PlayerRecord).isBot);
    const last = bots[bots.length - 1];
    if (last) session.ref.child("players/" + last).remove();
  }

  private leaveRoom(): void {
    if (this.session) this.session.leave();
    this.session = null;
    this.disposeMatch();
    this.showStart("");
  }

  private exitToStart(message: string): void {
    if (this.session) this.session.silentClose();
    this.session = null;
    this.disposeMatch();
    this.showStart(message);
  }

  private readonly loop = (timeMs: number): void => {
    this.step(timeMs);
    requestAnimationFrame(this.loop);
  };

  private step(timeMs: number): void {
    const deltaSeconds = Math.min(0.1, Math.max(0, (timeMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = timeMs;
    if (this.match) {
      this.backdrop.hide();
      this.match.update(deltaSeconds);
    } else {
      this.backdrop.render(deltaSeconds);
    }
  }
}
