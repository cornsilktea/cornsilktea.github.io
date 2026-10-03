"use strict";
class CastleSpyConfig {
}
CastleSpyConfig.ROOT = "castlespy/rooms";
CastleSpyConfig.MAX_PLAYERS = 6;
CastleSpyConfig.MIN_PLAYERS = 4;
CastleSpyConfig.TASKS_PER_PLAYER = 3;
CastleSpyConfig.MOVE_SPEED = 5.4;
CastleSpyConfig.PLAYER_RADIUS = 0.5;
CastleSpyConfig.KILL_RANGE = 2.8;
CastleSpyConfig.REPORT_RANGE = 3.8;
CastleSpyConfig.TASK_RANGE = 2.4;
CastleSpyConfig.TABLE_RANGE = 3.4;
CastleSpyConfig.VISION_RADIUS = 10;
CastleSpyConfig.FIRST_KILL_DELAY_MS = 12000;
CastleSpyConfig.KILL_COOLDOWN_MS = 20000;
CastleSpyConfig.EMERGENCY_UNLOCK_MS = 20000;
CastleSpyConfig.ROLE_REVEAL_MS = 4500;
CastleSpyConfig.TALK_MS = 30000;
CastleSpyConfig.VOTE_MS = 20000;
CastleSpyConfig.RESULT_MS = 6000;
CastleSpyConfig.NET_MS = 143;
CastleSpyConfig.VOTE_SKIP = "skip";
CastleSpyConfig.SLOT_COLORS = ["#E5484D", "#3E8EF0", "#3FB56B", "#F0C22E", "#B060E0", "#F08AB0"];
CastleSpyConfig.BOT_NAMES = ["코코", "모모", "보리", "두부", "별이", "구름"];
CastleSpyConfig.MODEL_DIRECTORY = "assets/kaykit/";
class Mathx {
    static clamp(value, low, high) {
        return value < low ? low : value > high ? high : value;
    }
    static lerp(from, to, ratio) {
        return from + (to - from) * ratio;
    }
    static angleDifference(a, b) {
        let difference = a - b;
        while (difference > Math.PI)
            difference -= Math.PI * 2;
        while (difference < -Math.PI)
            difference += Math.PI * 2;
        return difference;
    }
    static distance(ax, az, bx, bz) {
        return Math.hypot(ax - bx, az - bz);
    }
    static round2(value) {
        return Math.round(value * 100) / 100;
    }
    static seededRandom(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let mixed = state;
            mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
            mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
            return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
        };
    }
    static shuffled(items, random) {
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
    static byId(id) {
        return document.getElementById(id);
    }
    static show(element, visible) {
        element.hidden = !visible;
    }
    static setText(element, text) {
        if (element.textContent !== text)
            element.textContent = text;
    }
    static escape(text) {
        const table = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
        return String(text).replace(/[&<>"]/g, (character) => table[character]);
    }
}
class CastleMapData {
}
CastleMapData.CASTLE_YARD = {
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
class MapCatalog {
    static byId(id) {
        return MapCatalog.ALL.filter((definition) => definition.id === id)[0] || MapCatalog.ALL[0];
    }
}
MapCatalog.ALL = [CastleMapData.CASTLE_YARD];
class GameMap {
    constructor(definition) {
        this.definition = definition;
        this.rowCount = definition.rows.length;
        this.columns = definition.rows[0].length;
        this.cell = definition.cellSize;
    }
    cellChar(column, row) {
        if (column < 0 || row < 0 || column >= this.columns || row >= this.rowCount)
            return "#";
        return this.definition.rows[row].charAt(column);
    }
    isWallCell(column, row) {
        return this.cellChar(column, row) === "#";
    }
    worldX(cellX) {
        return (cellX - this.columns / 2) * this.cell;
    }
    worldZ(cellY) {
        return (cellY - this.rowCount / 2) * this.cell;
    }
    cellOfX(x) {
        return Math.floor(x / this.cell + this.columns / 2);
    }
    cellOfZ(z) {
        return Math.floor(z / this.cell + this.rowCount / 2);
    }
    cellCenter(column, row) {
        return { x: this.worldX(column + 0.5), z: this.worldZ(row + 0.5) };
    }
    roomNameAt(x, z) {
        return this.definition.roomNames[this.cellChar(this.cellOfX(x), this.cellOfZ(z))] || "";
    }
    floorColorAt(column, row) {
        const character = this.cellChar(column, row);
        return character === "#" ? null : this.definition.floorColors[character] || "#A39C8C";
    }
    tablePosition() {
        return { x: this.worldX(this.definition.table.x), z: this.worldZ(this.definition.table.y) };
    }
    taskPosition(taskIndex) {
        const spot = this.definition.tasks[taskIndex];
        return { x: this.worldX(spot.x), z: this.worldZ(spot.y) };
    }
    spawnPoint(index, count) {
        const table = this.tablePosition();
        const angle = (index / Math.max(1, count)) * Math.PI * 2 + 0.4;
        return { x: table.x + Math.cos(angle) * 3.4, z: table.z + Math.sin(angle) * 3.4 };
    }
    circleHitsWall(x, z, radius) {
        const firstColumn = this.cellOfX(x - radius), lastColumn = this.cellOfX(x + radius);
        const firstRow = this.cellOfZ(z - radius), lastRow = this.cellOfZ(z + radius);
        for (let row = firstRow; row <= lastRow; row++) {
            for (let column = firstColumn; column <= lastColumn; column++) {
                if (!this.isWallCell(column, row))
                    continue;
                const nearestX = Mathx.clamp(x, this.worldX(column), this.worldX(column + 1));
                const nearestZ = Mathx.clamp(z, this.worldZ(row), this.worldZ(row + 1));
                if (Mathx.distance(x, z, nearestX, nearestZ) < radius)
                    return true;
            }
        }
        return false;
    }
    move(x, z, deltaX, deltaZ, radius) {
        let nextX = x, nextZ = z;
        if (!this.circleHitsWall(x + deltaX, z, radius))
            nextX = x + deltaX;
        if (!this.circleHitsWall(nextX, z + deltaZ, radius))
            nextZ = z + deltaZ;
        return { x: nextX, z: nextZ };
    }
    hasLineOfSight(ax, az, bx, bz) {
        const distance = Mathx.distance(ax, az, bx, bz);
        const steps = Math.max(1, Math.ceil(distance / (this.cell * 0.4)));
        for (let step = 1; step < steps; step++) {
            const ratio = step / steps;
            if (this.isWallCell(this.cellOfX(Mathx.lerp(ax, bx, ratio)), this.cellOfZ(Mathx.lerp(az, bz, ratio))))
                return false;
        }
        return true;
    }
    findPath(from, to) {
        const startColumn = this.cellOfX(from.x), startRow = this.cellOfZ(from.z);
        const goalColumn = this.cellOfX(to.x), goalRow = this.cellOfZ(to.z);
        const startKey = startRow * this.columns + startColumn, goalKey = goalRow * this.columns + goalColumn;
        const cameFrom = new Map([[startKey, -1]]);
        const queue = [startKey];
        const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let head = 0; head < queue.length && !cameFrom.has(goalKey); head++) {
            const key = queue[head];
            const column = key % this.columns, row = Math.floor(key / this.columns);
            steps.forEach(([stepColumn, stepRow]) => {
                const nextColumn = column + stepColumn, nextRow = row + stepRow;
                const nextKey = nextRow * this.columns + nextColumn;
                if (this.isWallCell(nextColumn, nextRow) || cameFrom.has(nextKey))
                    return;
                cameFrom.set(nextKey, key);
                queue.push(nextKey);
            });
        }
        if (!cameFrom.has(goalKey))
            return [];
        const path = [];
        for (let key = goalKey; key !== startKey && key !== undefined; key = cameFrom.get(key)) {
            path.push(this.cellCenter(key % this.columns, Math.floor(key / this.columns)));
        }
        path.reverse();
        path.push(to);
        return path;
    }
    reachableCellCount() {
        const spawn = this.tablePosition();
        const startKey = this.cellOfZ(spawn.z) * this.columns + this.cellOfX(spawn.x);
        const seen = new Set([startKey]);
        const queue = [startKey];
        for (let head = 0; head < queue.length; head++) {
            const column = queue[head] % this.columns, row = Math.floor(queue[head] / this.columns);
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([stepColumn, stepRow]) => {
                const nextKey = (row + stepRow) * this.columns + column + stepColumn;
                if (this.isWallCell(column + stepColumn, row + stepRow) || seen.has(nextKey))
                    return;
                seen.add(nextKey);
                queue.push(nextKey);
            });
        }
        return seen.size;
    }
    walkableCellCount() {
        let count = 0;
        for (let row = 0; row < this.rowCount; row++) {
            for (let column = 0; column < this.columns; column++)
                if (!this.isWallCell(column, row))
                    count++;
        }
        return count;
    }
}
class MatchRules {
    static assignRoles(playerIds, random) {
        const spyId = Mathx.shuffled(playerIds, random)[0];
        const roles = {};
        playerIds.forEach((id) => { roles[id] = id === spyId ? "spy" : "hero"; });
        return roles;
    }
    static assignTasks(playerIds, taskCount, perPlayer, random) {
        const assignment = {};
        let bag = [];
        playerIds.forEach((id) => {
            const chosen = [];
            while (chosen.length < perPlayer) {
                if (!bag.length)
                    bag = Mathx.shuffled(Array.from({ length: taskCount }, (_, index) => index), random);
                const candidate = bag.pop();
                if (chosen.indexOf(candidate) < 0)
                    chosen.push(candidate);
            }
            assignment[id] = chosen;
        });
        return assignment;
    }
    static tally(votes, aliveIds) {
        const counts = {};
        aliveIds.forEach((voterId) => {
            const target = votes[voterId];
            if (target)
                counts[target] = (counts[target] || 0) + 1;
        });
        let best = 0, ejected = null, tie = false;
        Object.keys(counts).forEach((target) => {
            if (target === CastleSpyConfig.VOTE_SKIP)
                return;
            if (counts[target] > best) {
                best = counts[target];
                ejected = target;
                tie = false;
            }
            else if (counts[target] === best)
                tie = true;
        });
        const skipCount = counts[CastleSpyConfig.VOTE_SKIP] || 0;
        if (tie || best <= skipCount || best === 0)
            ejected = null;
        return { ejected, counts };
    }
    static winner(aliveHeroes, aliveSpies, tasksDone, tasksTotal) {
        if (aliveSpies <= 0)
            return { winner: "hero", reason: "스파이를 모두 찾아냈어요!" };
        if (aliveSpies >= aliveHeroes)
            return { winner: "spy", reason: "스파이가 살아남은 용사보다 많아졌어요!" };
        if (tasksTotal > 0 && tasksDone >= tasksTotal)
            return { winner: "hero", reason: "모든 할 일을 끝냈어요!" };
        return null;
    }
}
class SceneryAssets {
    constructor(libs) {
        this.libs = libs;
        this.tileGeometry = null;
        this.props = new Map();
    }
    async load(modelNames) {
        const loader = new this.libs.GLTFLoader();
        const directory = CastleSpyConfig.MODEL_DIRECTORY + "medieval/";
        const tileJob = loader.loadAsync(directory + "tiles/square_sand.glb").then((gltf) => {
            const mesh = gltf.scene.getObjectByProperty("isMesh", true);
            this.tileGeometry = mesh.geometry;
        });
        const propJobs = modelNames.map((name) => loader.loadAsync(directory + "objects/" + name + ".glb").then((gltf) => {
            gltf.scene.traverse((node) => {
                const mesh = node;
                if (!mesh.isMesh || Array.isArray(mesh.material))
                    return;
                const source = mesh.material;
                mesh.material = new this.libs.THREE.MeshLambertMaterial({ map: source.map, color: source.color });
            });
            this.props.set(name, gltf.scene);
        }).catch(() => undefined));
        await Promise.all([tileJob, ...propJobs]);
    }
    fit(name, footprint, height) {
        const template = this.props.get(name);
        if (!template)
            return null;
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
SceneryAssets.DECOR_MODELS = ["detail_treeA", "detail_treeB", "detail_treeC", "detail_rocks", "detail_rocks_small", "detail_hill", "detail_forestA"];
class LabelFactory {
    constructor(libs) {
        this.libs = libs;
    }
    create(text, color) {
        const THREE = this.libs.THREE;
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        const context = canvas.getContext("2d");
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
    constructor(libs, scenery, labels, map) {
        this.libs = libs;
        this.scenery = scenery;
        this.labels = labels;
        this.map = map;
        this.markerGroups = new Map();
        this.markerSpinners = new Map();
        this.group = new libs.THREE.Group();
        this.buildGround();
        this.buildFloors();
        this.buildWalls();
        this.buildProps();
        this.buildTable();
        this.buildTaskMarkers();
        this.buildScenery();
    }
    showTasks(pendingTaskIndices) {
        this.markerSpinners.forEach((spinner, index) => {
            spinner.visible = pendingTaskIndices.has(index);
        });
        this.markerGroups.forEach((marker, index) => {
            const ring = marker.getObjectByName("ring");
            if (ring)
                ring.visible = pendingTaskIndices.has(index);
        });
    }
    update(seconds) {
        this.markerSpinners.forEach((spinner, index) => {
            spinner.position.y = 1.9 + Math.sin(seconds * 3 + index) * 0.15;
            spinner.rotation.y = seconds * 1.6;
        });
    }
    dispose() {
        this.group.traverse((node) => {
            const mesh = node;
            if (mesh.isMesh && mesh.geometry && mesh.geometry !== this.scenery.tileGeometry)
                mesh.geometry.dispose();
        });
    }
    propCellKeys() {
        const keys = new Set();
        this.map.definition.props.forEach((prop) => keys.add(Math.floor(prop.x) + "," + Math.floor(prop.y)));
        return keys;
    }
    neighborFloorColor(column, row) {
        const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [offsetColumn, offsetRow] of offsets) {
            const color = this.map.floorColorAt(column + offsetColumn, row + offsetRow);
            if (color)
                return color;
        }
        return "#A39C8C";
    }
    buildGround() {
        const THREE = this.libs.THREE;
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x3A5238 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -MapView.TILE_THICKNESS - 0.15;
        this.group.add(ground);
    }
    buildFloors() {
        const THREE = this.libs.THREE;
        const geometry = this.scenery.tileGeometry;
        geometry.computeBoundingBox();
        const topY = geometry.boundingBox.max.y;
        const scaleY = MapView.TILE_THICKNESS / Math.max(0.001, topY * 2);
        const cells = [];
        const propCells = this.propCellKeys();
        for (let row = 0; row < this.map.rowCount; row++) {
            for (let column = 0; column < this.map.columns; column++) {
                const color = this.map.floorColorAt(column, row) || (propCells.has(column + "," + row) ? this.neighborFloorColor(column, row) : null);
                if (color)
                    cells.push({ column, row, color });
            }
        }
        const floors = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), cells.length);
        floors.frustumCulled = false;
        const matrix = new THREE.Matrix4(), color = new THREE.Color();
        const horizontalScale = (this.map.cell / 2) * 0.99;
        cells.forEach((cell, index) => {
            const center = this.map.cellCenter(cell.column, cell.row);
            matrix.compose(new THREE.Vector3(center.x, -topY * scaleY, center.z), new THREE.Quaternion(), new THREE.Vector3(horizontalScale, scaleY, horizontalScale));
            floors.setMatrixAt(index, matrix);
            color.set(cell.color);
            if ((cell.column + cell.row) % 2)
                color.multiplyScalar(0.92);
            floors.setColorAt(index, color);
        });
        floors.instanceMatrix.needsUpdate = true;
        if (floors.instanceColor)
            floors.instanceColor.needsUpdate = true;
        this.group.add(floors);
    }
    buildWalls() {
        const THREE = this.libs.THREE;
        const propCells = this.propCellKeys();
        const cells = [];
        for (let row = 0; row < this.map.rowCount; row++) {
            for (let column = 0; column < this.map.columns; column++) {
                if (this.map.isWallCell(column, row) && !propCells.has(column + "," + row))
                    cells.push({ column, row });
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
            if ((wall.column * 7 + wall.row * 3) % 3 === 0)
                color.multiplyScalar(0.9);
            bodies.setColorAt(index, color);
            matrix.makeTranslation(center.x, height - 0.1 + 0.15, center.z);
            caps.setMatrixAt(index, matrix);
        });
        bodies.instanceMatrix.needsUpdate = true;
        caps.instanceMatrix.needsUpdate = true;
        if (bodies.instanceColor)
            bodies.instanceColor.needsUpdate = true;
        this.group.add(bodies, caps);
    }
    buildProps() {
        this.map.definition.props.forEach((definition) => {
            const prop = this.scenery.fit(definition.model, definition.footprint * this.map.cell / 2, definition.height);
            if (!prop)
                return;
            prop.position.set(this.map.worldX(definition.x), 0, this.map.worldZ(definition.y));
            this.group.add(prop);
        });
    }
    buildTable() {
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
    buildTaskMarkers() {
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
    buildScenery() {
        const random = Mathx.seededRandom(77);
        const halfWidth = (this.map.columns * this.map.cell) / 2, halfDepth = (this.map.rowCount * this.map.cell) / 2;
        const models = SceneryAssets.DECOR_MODELS;
        let placed = 0;
        for (let attempt = 0; attempt < 400 && placed < 70; attempt++) {
            const x = (random() * 2 - 1) * (halfWidth + 26), z = (random() * 2 - 1) * (halfDepth + 22);
            if (Math.abs(x) < halfWidth + 3 && Math.abs(z) < halfDepth + 3)
                continue;
            const name = models[Math.floor(random() * models.length)];
            const prop = this.scenery.fit(name, 3 + random() * 2, 2.4 + random() * 3);
            if (!prop)
                continue;
            prop.position.set(x, -0.1, z);
            prop.rotation.y = random() * Math.PI * 2;
            this.group.add(prop);
            placed++;
        }
    }
}
MapView.WALL_HEIGHT = 1.7;
MapView.TILE_THICKNESS = 0.5;
class Actor {
    constructor(libs, factory, assets, labels, parent, id, record) {
        this.factory = factory;
        this.id = id;
        this.record = record;
        this.x = 0;
        this.z = 0;
        this.yaw = 0;
        this.moving = false;
        this.alive = true;
        this.role = null;
        this.materials = [];
        this.targetX = 0;
        this.targetZ = 0;
        this.shownYaw = 0;
        this.actionUntilMs = 0;
        this.ghostShown = false;
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
            const mesh = node;
            if (mesh.isMesh && !Array.isArray(mesh.material))
                this.materials.push(mesh.material);
        });
        this.animator = new CharacterAnimator(libs, this.model, assets.clips);
        this.animator.play(Actor.CLIP_IDLE);
    }
    placeAt(x, z) {
        this.x = this.targetX = x;
        this.z = this.targetZ = z;
    }
    receiveRemote(x, z, yaw, moving) {
        this.targetX = x;
        this.targetZ = z;
        this.yaw = yaw;
        this.moving = moving;
    }
    stepRemote(deltaSeconds) {
        const follow = Math.min(1, deltaSeconds * 12);
        this.x = Mathx.lerp(this.x, this.targetX, follow);
        this.z = Mathx.lerp(this.z, this.targetZ, follow);
    }
    playAction(clipName, durationMs, nowMs) {
        this.animator.play(clipName, { once: true });
        this.actionUntilMs = nowMs + durationMs;
    }
    setGhost(ghost) {
        if (ghost === this.ghostShown)
            return;
        this.ghostShown = ghost;
        this.materials.forEach((material) => {
            material.transparent = ghost;
            material.opacity = ghost ? Actor.GHOST_OPACITY : 1;
            material.depthWrite = !ghost;
            material.needsUpdate = true;
        });
    }
    setVisible(visible) {
        this.group.visible = visible;
    }
    render(deltaSeconds, nowMs) {
        this.shownYaw += Mathx.angleDifference(this.yaw, this.shownYaw) * Math.min(1, deltaSeconds * 14);
        this.group.position.set(this.x, 0, this.z);
        this.group.rotation.y = this.shownYaw;
        if (nowMs >= this.actionUntilMs)
            this.animator.play(this.moving ? Actor.CLIP_RUN : Actor.CLIP_IDLE);
        this.animator.update(deltaSeconds);
    }
    dispose(parent) {
        parent.remove(this.group);
        this.factory.disposeModel(this.model);
    }
}
Actor.CLIP_IDLE = "Idle_A";
Actor.CLIP_RUN = "Running_A";
Actor.CLIP_STAB = "Melee_1H_Attack_Stab";
Actor.CLIP_WORK = "Melee_1H_Attack_Chop";
Actor.GHOST_OPACITY = 0.42;
class BodyView {
    constructor(libs, factory, assets, parent, record, x, z) {
        this.factory = factory;
        this.parent = parent;
        this.x = x;
        this.z = z;
        this.group = new libs.THREE.Group();
        this.model = factory.build(CharacterLooks.clean(record.look));
        this.group.add(this.model);
        this.group.position.set(x, 0, z);
        this.group.rotation.y = (x * 7.3 + z * 3.1) % (Math.PI * 2);
        parent.add(this.group);
        this.animator = new CharacterAnimator(libs, this.model, assets.clips);
        this.animator.play("Death_A", { once: true });
    }
    update(deltaSeconds) {
        this.animator.update(deltaSeconds);
    }
    dispose() {
        this.parent.remove(this.group);
        this.factory.disposeModel(this.model);
    }
}
class WorldView {
    constructor(libs, canvas, touchDevice) {
        this.focusX = 0;
        this.focusZ = 0;
        this.focusReady = false;
        this.slowSeconds = 0;
        this.fpsSeconds = 0;
        this.fpsFrames = 0;
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
    resize() {
        const width = window.innerWidth, height = window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.fov = width / height < 0.9 ? 52 : 42;
        this.camera.updateProjectionMatrix();
    }
    follow(x, z, deltaSeconds) {
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
    snapCamera() {
        this.focusReady = false;
    }
    orbit(centerX, centerZ, radius, height, angle) {
        this.camera.position.set(centerX + Math.sin(angle) * radius, height, centerZ + Math.cos(angle) * radius);
        this.camera.lookAt(centerX, 0, centerZ);
    }
    render(deltaSeconds) {
        this.renderer.render(this.scene, this.camera);
        this.adaptQuality(deltaSeconds);
    }
    adaptQuality(deltaSeconds) {
        this.fpsSeconds += deltaSeconds;
        this.fpsFrames++;
        if (this.fpsSeconds < 0.5)
            return;
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
WorldView.CAMERA_HEIGHT = 17;
WorldView.CAMERA_BACK = 9.5;
class InputController {
    constructor(zone, base, knob) {
        this.zone = zone;
        this.base = base;
        this.knob = knob;
        this.onUse = () => undefined;
        this.onReport = () => undefined;
        this.onKill = () => undefined;
        this.enabled = true;
        this.held = new Set();
        this.joystickPointer = null;
        this.joystickOriginX = 0;
        this.joystickOriginY = 0;
        this.joystickX = 0;
        this.joystickZ = 0;
        this.bindKeyboard();
        this.bindJoystick();
        this.bindButton("btnUse", () => this.onUse());
        this.bindButton("btnReport", () => this.onReport());
        this.bindButton("btnKill", () => this.onKill());
    }
    axis() {
        if (!this.enabled)
            return { x: 0, z: 0 };
        let x = this.joystickX, z = this.joystickZ;
        if (this.held.has("KeyA") || this.held.has("ArrowLeft"))
            x -= 1;
        if (this.held.has("KeyD") || this.held.has("ArrowRight"))
            x += 1;
        if (this.held.has("KeyW") || this.held.has("ArrowUp"))
            z -= 1;
        if (this.held.has("KeyS") || this.held.has("ArrowDown"))
            z += 1;
        const length = Math.hypot(x, z);
        return length > 1 ? { x: x / length, z: z / length } : { x, z };
    }
    releaseAll() {
        this.held.clear();
        this.joystickPointer = null;
        this.joystickX = this.joystickZ = 0;
        this.base.hidden = true;
    }
    bindKeyboard() {
        const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
        window.addEventListener("keydown", (event) => {
            if (event.target.tagName === "INPUT" || !this.enabled)
                return;
            const code = this.codeOf(event);
            if (movementKeys.indexOf(code) >= 0) {
                this.held.add(code);
                event.preventDefault();
            }
            else if (!event.repeat && (code === "KeyE" || code === "Space")) {
                this.onUse();
                event.preventDefault();
            }
            else if (!event.repeat && code === "KeyR")
                this.onReport();
            else if (!event.repeat && (code === "KeyQ" || code === "KeyK"))
                this.onKill();
        });
        window.addEventListener("keyup", (event) => this.held.delete(this.codeOf(event)));
        window.addEventListener("blur", () => this.held.clear());
    }
    codeOf(event) {
        return event.key.indexOf("Arrow") === 0 ? event.key : event.code;
    }
    bindJoystick() {
        this.zone.addEventListener("pointerdown", (event) => {
            if (this.joystickPointer !== null)
                return;
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
            if (event.pointerId !== this.joystickPointer)
                return;
            const deltaX = event.clientX - this.joystickOriginX, deltaY = event.clientY - this.joystickOriginY;
            const length = Math.hypot(deltaX, deltaY) || 1;
            const reach = Math.min(length, InputController.JOYSTICK_RADIUS);
            this.knob.style.transform = "translate(" + (deltaX / length) * reach + "px," + (deltaY / length) * reach + "px)";
            const strength = Math.min(1, length / InputController.JOYSTICK_RADIUS);
            if (strength < InputController.DEAD_ZONE)
                this.joystickX = this.joystickZ = 0;
            else {
                this.joystickX = (deltaX / length) * strength;
                this.joystickZ = (deltaY / length) * strength;
            }
        });
        const end = (event) => {
            if (event.pointerId !== this.joystickPointer)
                return;
            this.joystickPointer = null;
            this.joystickX = this.joystickZ = 0;
            this.base.hidden = true;
        };
        this.zone.addEventListener("pointerup", end);
        this.zone.addEventListener("pointercancel", end);
    }
    bindButton(id, action) {
        const button = Dom.byId(id);
        button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            if (this.enabled)
                action();
        });
    }
}
InputController.JOYSTICK_RADIUS = 55;
InputController.DEAD_ZONE = 0.18;
class TaskGame {
    constructor(overlay, title, onFinished) {
        this.overlay = overlay;
        this.title = title;
        this.onFinished = onFinished;
        this.finished = false;
        this.keyDownHandler = (event) => this.handleKey(event, true);
        this.keyUpHandler = (event) => this.handleKey(event, false);
    }
    open() {
        this.overlay.innerHTML = "<div class='task-card'><h2></h2><div class='task-body'></div><button type='button' class='st-btn sub slim task-close'>그만두기</button></div>";
        this.card = this.overlay.firstElementChild;
        this.card.querySelector("h2").textContent = this.title;
        this.body = this.card.querySelector(".task-body");
        this.card.querySelector(".task-close").addEventListener("click", () => this.abandon());
        this.overlay.hidden = false;
        window.addEventListener("keydown", this.keyDownHandler);
        window.addEventListener("keyup", this.keyUpHandler);
        this.build();
    }
    update(deltaSeconds) {
        if (!this.finished)
            this.tick(deltaSeconds);
    }
    abandon() {
        this.closeCard();
        this.onFinished(false);
    }
    tick(_deltaSeconds) {
        return;
    }
    handleKey(_event, _pressed) {
        return;
    }
    complete() {
        if (this.finished)
            return;
        this.finished = true;
        this.body.innerHTML = "<div class='task-done'>완료!</div>";
        setTimeout(() => {
            this.closeCard();
            this.onFinished(true);
        }, TaskGame.CLOSE_DELAY_MS);
    }
    closeCard() {
        this.finished = true;
        window.removeEventListener("keydown", this.keyDownHandler);
        window.removeEventListener("keyup", this.keyUpHandler);
        this.overlay.hidden = true;
        this.overlay.innerHTML = "";
    }
}
TaskGame.CLOSE_DELAY_MS = 700;
class HoldTask extends TaskGame {
    constructor() {
        super(...arguments);
        this.progress = 0;
        this.holding = false;
    }
    build() {
        this.body.innerHTML = "<p class='task-tip'>버튼을 꾹 누르고 있어요</p><button type='button' class='task-hold'>누르고 있기</button><div class='task-bar'><i></i></div>";
        this.fill = this.body.querySelector(".task-bar i");
        const button = this.body.querySelector(".task-hold");
        button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        button.addEventListener("pointerdown", () => { this.holding = true; });
        ["pointerup", "pointerleave", "pointercancel"].forEach((name) => button.addEventListener(name, () => { this.holding = false; }));
    }
    tick(deltaSeconds) {
        this.progress = this.holding
            ? this.progress + deltaSeconds / HoldTask.SECONDS_TO_FINISH
            : Math.max(0, this.progress - deltaSeconds * 1.5);
        this.fill.style.width = Math.min(100, this.progress * 100) + "%";
        if (this.progress >= 1)
            this.complete();
    }
    handleKey(event, pressed) {
        if (event.code === "Space" || event.code === "Enter") {
            this.holding = pressed;
            event.preventDefault();
        }
    }
}
HoldTask.SECONDS_TO_FINISH = 2.5;
class SequenceTask extends TaskGame {
    constructor() {
        super(...arguments);
        this.next = 1;
    }
    build() {
        const order = Mathx.shuffled(Array.from({ length: SequenceTask.COUNT }, (_, index) => index + 1), Math.random);
        this.body.innerHTML = "<p class='task-tip'>1부터 5까지 순서대로 눌러요</p><div class='task-seq'>" +
            order.map((number) => "<button type='button' data-n='" + number + "'>" + number + "</button>").join("") + "</div>";
        this.body.querySelector(".task-seq").addEventListener("click", (event) => {
            const button = event.target.closest("button[data-n]");
            if (button)
                this.press(button);
        });
    }
    press(button) {
        if (this.finished || button.classList.contains("on"))
            return;
        if (Number(button.dataset.n) === this.next) {
            button.classList.add("on");
            this.next++;
            if (this.next > SequenceTask.COUNT)
                this.complete();
            return;
        }
        this.next = 1;
        this.body.querySelectorAll("button").forEach((other) => other.classList.remove("on"));
        button.classList.add("wrong");
        setTimeout(() => button.classList.remove("wrong"), 250);
    }
}
SequenceTask.COUNT = 5;
class TimingTask extends TaskGame {
    constructor() {
        super(...arguments);
        this.hits = 0;
        this.clock = 0;
        this.zoneStart = 0.4;
    }
    build() {
        this.body.innerHTML = "<p class='task-tip'>초록 칸 안에서 멈춰요 (<span class='task-hits'>0</span>/" + TimingTask.HITS_NEEDED + ")</p>" +
            "<div class='task-track'><div class='task-zone'></div><div class='task-cursor'></div></div><button type='button' class='task-hold'>멈춰!</button><div class='task-msg'></div>";
        this.cursor = this.body.querySelector(".task-cursor");
        this.zone = this.body.querySelector(".task-zone");
        this.message = this.body.querySelector(".task-msg");
        const stop = this.body.querySelector(".task-hold");
        stop.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        stop.addEventListener("pointerdown", () => this.stop());
        this.moveZone();
    }
    tick(deltaSeconds) {
        this.clock += deltaSeconds;
        this.cursor.style.left = this.cursorPosition() * 100 + "%";
    }
    handleKey(event, pressed) {
        if (pressed && !event.repeat && (event.code === "Space" || event.code === "Enter")) {
            this.stop();
            event.preventDefault();
        }
    }
    cursorPosition() {
        const phase = (this.clock / TimingTask.SWEEP_SECONDS) % 2;
        return phase < 1 ? phase : 2 - phase;
    }
    moveZone() {
        this.zoneStart = 0.1 + Math.random() * (0.8 - TimingTask.ZONE_WIDTH);
        this.zone.style.left = this.zoneStart * 100 + "%";
        this.zone.style.width = TimingTask.ZONE_WIDTH * 100 + "%";
    }
    stop() {
        if (this.finished)
            return;
        const position = this.cursorPosition();
        const hit = position >= this.zoneStart && position <= this.zoneStart + TimingTask.ZONE_WIDTH;
        this.hits = hit ? this.hits + 1 : Math.max(0, this.hits - 1);
        this.message.textContent = hit ? "좋아요!" : "아쉬워요";
        this.body.querySelector(".task-hits").textContent = String(this.hits);
        if (this.hits >= TimingTask.HITS_NEEDED)
            this.complete();
        else
            this.moveZone();
    }
}
TimingTask.HITS_NEEDED = 3;
TimingTask.ZONE_WIDTH = 0.2;
TimingTask.SWEEP_SECONDS = 1.1;
class TaskGameCatalog {
    static create(kind, overlay, title, onFinished) {
        return new TaskGameCatalog.CREATORS[kind](overlay, title, onFinished);
    }
}
TaskGameCatalog.CREATORS = {
    hold: HoldTask,
    sequence: SequenceTask,
    timing: TimingTask
};
class MeetingView {
    constructor() {
        this.root = Dom.byId("meetingScreen");
        this.titleLabel = Dom.byId("meetingTitle");
        this.phaseLabel = Dom.byId("meetingPhase");
        this.cardBox = Dom.byId("meetingCards");
        this.skipButton = Dom.byId("btnSkipVote");
        this.resultBox = Dom.byId("meetingResult");
        this.lastSignature = "";
        this.onVote = () => undefined;
        this.cardBox.addEventListener("click", (event) => {
            const card = event.target.closest(".mv-card[data-id]");
            if (card && !card.classList.contains("locked"))
                this.onVote(card.dataset.id);
        });
        this.skipButton.addEventListener("click", () => this.onVote(CastleSpyConfig.VOTE_SKIP));
    }
    open() {
        this.lastSignature = "";
        this.root.hidden = false;
    }
    close() {
        this.root.hidden = true;
    }
    render(state) {
        Dom.setText(this.titleLabel, state.title);
        const phaseText = state.phase === "talk" ? "토론 시간" : state.phase === "vote" ? "투표 시간" : "투표 결과";
        Dom.setText(this.phaseLabel, phaseText + " · " + Math.max(0, Math.ceil(state.secondsLeft)) + "초");
        const signature = JSON.stringify([state.phase, state.cards, state.myVote, state.canVote, state.skipVotes, state.resultText]);
        if (signature === this.lastSignature)
            return;
        this.lastSignature = signature;
        this.cardBox.innerHTML = state.cards.map((card) => this.cardHtml(card, state)).join("");
        this.skipButton.hidden = state.phase === "result";
        this.skipButton.disabled = !state.canVote || state.myVote !== null;
        this.skipButton.classList.toggle("picked", state.myVote === CastleSpyConfig.VOTE_SKIP);
        Dom.setText(this.skipButton, state.myVote === CastleSpyConfig.VOTE_SKIP ? "건너뛰기 선택함" : "건너뛰기");
        this.resultBox.hidden = !state.resultText;
        this.resultBox.textContent = state.resultText;
    }
    cardHtml(card, state) {
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
    constructor() {
        this.roleChip = Dom.byId("hudRole");
        this.taskList = Dom.byId("hudTaskList");
        this.progressFill = Dom.byId("hudProgressFill");
        this.progressText = Dom.byId("hudProgressText");
        this.useButton = Dom.byId("btnUse");
        this.reportButton = Dom.byId("btnReport");
        this.killButton = Dom.byId("btnKill");
        this.killCooldown = Dom.byId("btnKillCooldown");
        this.banner = Dom.byId("banner");
        this.bannerText = Dom.byId("bannerBox");
        this.roleReveal = Dom.byId("roleReveal");
        this.bannerTimer = 0;
    }
    setRole(role) {
        this.roleChip.hidden = !role;
        if (!role)
            return;
        this.roleChip.className = "hud-box role-" + role;
        Dom.setText(this.roleChip, role === "spy" ? "당신은 스파이" : "당신은 용사");
    }
    setTasks(items, isSpy) {
        const heading = isSpy ? "가짜 할 일 (들키지 않게!)" : "내 할 일";
        this.taskList.innerHTML = "<span class='lab'>" + heading + "</span>" + items.map((item) => "<div class='task" + (item.done ? " done" : "") + "'>" + Dom.escape(item.room) + " · " + Dom.escape(item.title) + "</div>").join("");
    }
    setProgress(done, total) {
        const ratio = total > 0 ? done / total : 0;
        this.progressFill.style.width = ratio * 100 + "%";
        Dom.setText(this.progressText, "할 일 " + done + " / " + total);
    }
    setUseLabel(label) {
        this.useButton.hidden = !label;
        if (label)
            Dom.setText(this.useButton.querySelector("span"), label);
    }
    setReportVisible(visible) {
        this.reportButton.hidden = !visible;
    }
    setKill(visible, ready, cooldownRatio) {
        this.killButton.hidden = !visible;
        this.killButton.classList.toggle("ready", ready);
        this.killCooldown.style.height = (ready ? 0 : cooldownRatio * 100) + "%";
    }
    showBanner(text, durationMs) {
        this.bannerText.textContent = text;
        this.banner.hidden = false;
        clearTimeout(this.bannerTimer);
        this.bannerTimer = window.setTimeout(() => { this.banner.hidden = true; }, durationMs);
    }
    showRoleReveal(role, partnerNames, durationMs) {
        const text = role === "spy"
            ? "<h1 class='spy'>당신은 스파이!</h1><p>들키지 않게 용사들을 하나씩 처치하세요.</p>"
            : "<h1 class='hero'>당신은 용사!</h1><p>할 일을 모두 끝내고, 숨은 스파이를 찾아내세요.</p>";
        this.roleReveal.innerHTML = text + (partnerNames.length ? "<p>동료 스파이: " + partnerNames.map(Dom.escape).join(", ") + "</p>" : "");
        this.roleReveal.hidden = false;
        setTimeout(() => { this.roleReveal.hidden = true; }, durationMs);
    }
}
class StateCodec {
    static encode(x, z, yaw, moving) {
        return [Mathx.round2(x), Mathx.round2(z), Mathx.round2(yaw), moving ? 1 : 0].join(",");
    }
    static decode(raw) {
        if (typeof raw !== "string")
            return null;
        const parts = raw.split(",").map(Number);
        if (parts.length < 4 || parts.some((part) => isNaN(part)))
            return null;
        return { x: parts[0], z: parts[1], yaw: parts[2], moving: parts[3] === 1 };
    }
}
class Backend {
    constructor() {
        this.database = null;
        this.serverOffset = 0;
        const config = window.PORTAL_CONFIG;
        try {
            if (window.firebase && config && config.isReady()) {
                window.firebase.initializeApp({ apiKey: config.API_KEY, authDomain: config.AUTH_DOMAIN, databaseURL: config.DB_URL.replace(/\/+$/, "") });
                this.database = window.firebase.database();
            }
        }
        catch (error) {
            this.database = null;
        }
        if (this.database) {
            this.database.ref(".info/serverTimeOffset").on("value", (snapshot) => {
                this.serverOffset = snapshot.val() || 0;
            });
        }
    }
    now() {
        return Date.now() + this.serverOffset;
    }
    databaseUrl() {
        return window.PORTAL_CONFIG ? window.PORTAL_CONFIG.DB_URL.replace(/\/+$/, "") : "";
    }
}
class RoomSession {
    constructor(backend, code, myId) {
        this.backend = backend;
        this.code = code;
        this.myId = myId;
        this.players = new Map();
        this.hostId = null;
        this.hostLoaded = false;
        this.status = "lobby";
        this.mapId = MapCatalog.ALL[0].id;
        this.match = null;
        this.roles = {};
        this.tasks = {};
        this.done = {};
        this.dead = {};
        this.out = {};
        this.buttonUsed = {};
        this.meeting = null;
        this.votes = {};
        this.result = null;
        this.end = null;
        this.progress = null;
        this.onChange = () => undefined;
        this.onRemoteState = () => undefined;
        this.onClosed = () => undefined;
        this.subscriptions = [];
        this.leaving = false;
        this.ref = backend.database.ref(CastleSpyConfig.ROOT + "/" + code);
    }
    isHost() {
        return this.hostId === this.myId;
    }
    order() {
        return Array.from(this.players.keys()).sort((a, b) => {
            const difference = this.players.get(a).joinedAt - this.players.get(b).joinedAt;
            return difference || (a < b ? -1 : 1);
        });
    }
    humanIds() {
        return this.order().filter((id) => !this.players.get(id).isBot);
    }
    freeSlot() {
        const used = new Set();
        this.players.forEach((record) => used.add(record.slot));
        for (let slot = 0; slot < CastleSpyConfig.MAX_PLAYERS; slot++)
            if (!used.has(slot))
                return slot;
        return 0;
    }
    isAlive(id) {
        return this.players.has(id) && !this.dead[id] && this.out[id] === undefined;
    }
    connect() {
        this.armDisconnect();
        const playersRef = this.ref.child("players");
        this.subscribe(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
        this.subscribe(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
        this.subscribe(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
        this.subscribe(this.backend.database.ref(".info/connected"), "value", (snapshot) => {
            if (snapshot.val() === true && !this.leaving)
                this.armDisconnect();
        });
        this.watchValue("hostPlayerId", (value) => { this.hostId = value || null; this.hostLoaded = true; this.electHost(); this.onChange("host"); });
        this.watchValue("status", (value) => {
            if (value === null) {
                if (!this.leaving)
                    this.onClosed("방이 종료되었어요.");
                return;
            }
            this.status = value;
            this.onChange("status");
        });
        this.watchValue("mapId", (value) => { this.mapId = value || MapCatalog.ALL[0].id; this.onChange("map"); });
        this.watchValue("match", (value) => { this.match = value; this.onChange("match"); });
        this.watchValue("roles/" + this.myId, (value) => {
            if (value)
                this.roles[this.myId] = value;
            else
                delete this.roles[this.myId];
            this.onChange("roles");
        });
        this.watchValue("tasks", (value) => { this.tasks = value || {}; this.onChange("tasks"); });
        this.watchValue("done", (value) => { this.done = value || {}; this.onChange("done"); });
        this.watchValue("dead", (value) => { this.dead = value || {}; this.onChange("dead"); });
        this.watchValue("out", (value) => { this.out = value || {}; this.onChange("out"); });
        this.watchValue("buttonUsed", (value) => { this.buttonUsed = value || {}; this.onChange("buttons"); });
        this.watchValue("meeting", (value) => { this.meeting = value; this.onChange("meeting"); });
        this.watchValue("votes", (value) => { this.votes = value || {}; this.onChange("votes"); });
        this.watchValue("result", (value) => { this.result = value; this.onChange("result"); });
        this.watchValue("end", (value) => { this.end = value; this.onChange("end"); });
        this.watchValue("progress", (value) => { this.progress = value; this.onChange("progress"); });
        const stateRef = this.ref.child("st");
        const onState = (snapshot) => {
            const state = StateCodec.decode(snapshot.val());
            if (state && snapshot.key !== this.myId)
                this.onRemoteState(snapshot.key, state);
        };
        this.subscribe(stateRef, "child_added", onState);
        this.subscribe(stateRef, "child_changed", onState);
    }
    loadAllRoles() {
        return this.ref.child("roles").once("value").then((snapshot) => {
            this.roles = snapshot.val() || {};
            this.onChange("roles");
        });
    }
    pushProfile(record) {
        if (this.players.has(this.myId))
            this.ref.child("players/" + this.myId).update({ nick: record.nick, look: record.look });
    }
    writeState(raw) {
        this.ref.child("st/" + this.myId).set(raw);
    }
    leave() {
        this.leaving = true;
        this.unsubscribeAll();
        const mine = this.ref.child("players/" + this.myId);
        try {
            mine.onDisconnect().cancel();
        }
        catch (error) {
            return;
        }
        mine.remove()
            .then(() => this.ref.child("players").once("value"))
            .then((snapshot) => {
            const players = snapshot.val() || {};
            const humans = Object.keys(players).filter((id) => !players[id].isBot).sort((a, b) => players[a].joinedAt - players[b].joinedAt);
            if (!humans.length)
                return this.ref.remove();
            return this.ref.child("hostPlayerId").once("value").then((host) => {
                const hostId = host.val();
                if (!hostId || !players[hostId] || players[hostId].isBot)
                    return this.ref.update({ hostPlayerId: humans[0] });
            });
        })
            .catch(() => undefined);
    }
    silentClose() {
        this.leaving = true;
        this.unsubscribeAll();
        try {
            this.ref.child("players/" + this.myId).onDisconnect().cancel();
        }
        catch (error) {
            return;
        }
    }
    removeMineOnUnload() {
        try {
            this.ref.child("players/" + this.myId).remove();
        }
        catch (error) {
            return;
        }
    }
    watchValue(path, apply) {
        this.subscribe(this.ref.child(path), "value", (snapshot) => apply(snapshot.val()));
    }
    subscribe(ref, event, listener) {
        ref.on(event, listener);
        this.subscriptions.push({ ref, event, listener });
    }
    unsubscribeAll() {
        this.subscriptions.forEach((entry) => {
            try {
                entry.ref.off(entry.event, entry.listener);
            }
            catch (error) {
                return;
            }
        });
        this.subscriptions = [];
    }
    armDisconnect() {
        this.ref.child("players/" + this.myId).onDisconnect().remove();
        this.ref.child("st/" + this.myId).onDisconnect().remove();
    }
    setPlayer(snapshot) {
        const record = snapshot.val();
        if (!record)
            return;
        record.look = CharacterLooks.clean(record.look);
        this.players.set(snapshot.key, record);
        this.onChange("players");
    }
    removePlayer(snapshot) {
        const gone = this.players.get(snapshot.key) || snapshot.val();
        if (snapshot.key === this.myId && !this.leaving) {
            this.rejoinAfterDrop(gone, 0);
            return;
        }
        this.players.delete(snapshot.key);
        this.electHost();
        this.onChange("players");
    }
    rejoinAfterDrop(last, tries) {
        if (!last || tries >= RoomSession.REJOIN_TRIES) {
            if (!this.leaving)
                this.onClosed("연결이 끊겨 방에서 나왔어요.");
            return;
        }
        this.ref.child("status").once("value").then((snapshot) => {
            if (this.leaving)
                return;
            if (snapshot.val() === null) {
                this.onClosed("방이 종료되었어요.");
                return;
            }
            return this.ref.child("players/" + this.myId).set(last).then(() => this.armDisconnect());
        }).catch(() => {
            if (!this.leaving)
                setTimeout(() => this.rejoinAfterDrop(last, tries + 1), 1000);
        });
    }
    electHost() {
        if (!this.hostLoaded || !this.players.has(this.myId))
            return;
        const current = this.hostId ? this.players.get(this.hostId) : null;
        if (current && !current.isBot)
            return;
        if (this.humanIds()[0] === this.myId) {
            this.hostId = this.myId;
            this.ref.update({ hostPlayerId: this.myId });
        }
    }
}
RoomSession.REJOIN_TRIES = 3;
class RoomDirectory {
    constructor(backend) {
        this.backend = backend;
    }
    async create(myId, record) {
        await this.sweep();
        const database = this.backend.database;
        for (let attempt = 0; attempt < 9; attempt++) {
            const code = String(10000 + Math.floor(Math.random() * 90000));
            const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.now(), mapId: MapCatalog.ALL[0].id, players: { [myId]: record } };
            const result = await database.ref(CastleSpyConfig.ROOT + "/" + code).transaction((current) => (current !== null ? undefined : room));
            if (result.committed)
                return code;
        }
        return null;
    }
    async join(code, myId, record) {
        const room = this.backend.database.ref(CastleSpyConfig.ROOT + "/" + code);
        const [playersSnapshot, statusSnapshot] = await Promise.all([room.child("players").once("value"), room.child("status").once("value")]);
        const players = playersSnapshot.val();
        if (!players || !Object.keys(players).some((id) => !players[id].isBot))
            return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
        if (statusSnapshot.val() !== "lobby")
            return { ok: false, message: "이미 게임이 진행 중이에요. 끝난 뒤 다시 들어와 주세요." };
        if (Object.keys(players).length >= CastleSpyConfig.MAX_PLAYERS)
            return { ok: false, message: "방이 가득 찼어요. (최대 " + CastleSpyConfig.MAX_PLAYERS + "명)" };
        const used = new Set();
        Object.keys(players).forEach((id) => used.add(players[id].slot));
        let slot = 0;
        while (used.has(slot))
            slot++;
        await room.child("players/" + myId).set(Object.assign({}, record, { slot }));
        return { ok: true, message: "" };
    }
    async sweep() {
        try {
            const base = this.backend.databaseUrl();
            const response = await fetch(base + "/" + CastleSpyConfig.ROOT + ".json?shallow=true");
            const codes = response.ok ? Object.keys((await response.json()) || {}) : [];
            const now = this.backend.now();
            const database = this.backend.database;
            const updates = {};
            await Promise.all(codes.map(async (code) => {
                const room = database.ref(CastleSpyConfig.ROOT + "/" + code);
                const [created, players] = await Promise.all([room.child("createdAt").once("value"), room.child("players").once("value")]);
                const age = now - (created.val() || 0);
                const map = players.val() || {};
                const hasHuman = Object.keys(map).some((id) => !map[id].isBot);
                if ((!hasHuman && age > RoomDirectory.STALE_EMPTY_MS) || age > RoomDirectory.STALE_OLD_MS)
                    updates[code] = null;
            }));
            if (Object.keys(updates).length)
                await database.ref(CastleSpyConfig.ROOT).update(updates);
        }
        catch (error) {
            return;
        }
    }
}
RoomDirectory.STALE_EMPTY_MS = 60000;
RoomDirectory.STALE_OLD_MS = 6 * 3600000;
class BotBrain {
    constructor(actor, world) {
        this.actor = actor;
        this.world = world;
        this.path = [];
        this.busyUntilMs = 0;
        this.voteDelayMs = 3000 + world.random() * 9000;
    }
    step(deltaSeconds, nowMs) {
        if (nowMs < this.busyUntilMs) {
            this.actor.moving = false;
            return;
        }
        this.decide(nowMs);
        this.follow(deltaSeconds);
    }
    resetAfterMeeting(nowMs) {
        this.path = [];
        this.busyUntilMs = nowMs + 1000 + this.world.random() * 2000;
    }
    goTo(point) {
        this.path = this.world.map.findPath({ x: this.actor.x, z: this.actor.z }, point);
    }
    distanceTo(point) {
        return Mathx.distance(this.actor.x, this.actor.z, point.x, point.z);
    }
    wander(nowMs) {
        if (this.path.length)
            return;
        const map = this.world.map;
        for (let attempt = 0; attempt < 20; attempt++) {
            const column = 1 + Math.floor(this.world.random() * (map.columns - 2)), row = 1 + Math.floor(this.world.random() * (map.rowCount - 2));
            if (map.isWallCell(column, row))
                continue;
            this.goTo(map.cellCenter(column, row));
            this.busyUntilMs = nowMs + this.world.random() * 1500;
            return;
        }
    }
    pickVote(candidates, skipChance) {
        if (!candidates.length || this.world.random() < skipChance)
            return CastleSpyConfig.VOTE_SKIP;
        return candidates[Math.floor(this.world.random() * candidates.length)];
    }
    follow(deltaSeconds) {
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
BotBrain.ARRIVE_DISTANCE = 0.6;
BotBrain.SPEED_FACTOR = 0.85;
class HeroBotBrain extends BotBrain {
    constructor() {
        super(...arguments);
        this.currentTask = null;
        this.workingSinceMs = 0;
        this.consideredBodies = new Set();
        this.bodyTarget = null;
    }
    chooseVote(candidates) {
        return this.pickVote(candidates, 0.3);
    }
    decide(nowMs) {
        if (this.actor.alive && this.reactToBodies())
            return;
        this.doTasks(nowMs);
    }
    reactToBodies() {
        if (!this.bodyTarget) {
            for (const body of this.world.bodyPositions()) {
                if (this.consideredBodies.has(body.id))
                    continue;
                if (Mathx.distance(this.actor.x, this.actor.z, body.x, body.z) > HeroBotBrain.BODY_NOTICE_RANGE || !this.world.canSee(this.actor, body.x, body.z))
                    continue;
                this.consideredBodies.add(body.id);
                if (this.world.random() < HeroBotBrain.REPORT_CHANCE) {
                    this.bodyTarget = body;
                    this.goTo({ x: body.x, z: body.z });
                }
                break;
            }
        }
        if (!this.bodyTarget)
            return false;
        if (this.distanceTo(this.bodyTarget) <= CastleSpyConfig.REPORT_RANGE - 0.8) {
            this.world.reportBy(this.actor.id, this.bodyTarget.id);
            this.bodyTarget = null;
            this.path = [];
        }
        return true;
    }
    doTasks(nowMs) {
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
            if (!this.path.length)
                this.goTo(position);
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
    resetAfterMeeting(nowMs) {
        super.resetAfterMeeting(nowMs);
        this.bodyTarget = null;
        this.currentTask = null;
    }
}
HeroBotBrain.BODY_NOTICE_RANGE = 9;
HeroBotBrain.REPORT_CHANCE = 0.75;
class SpyBotBrain extends BotBrain {
    chooseVote(candidates) {
        const heroes = candidates.filter((id) => this.world.roleOf(id) !== "spy");
        return this.pickVote(heroes, 0.4);
    }
    constructor(actor, world, firstKillAtMs) {
        super(actor, world);
        this.repathAtMs = 0;
        this.nextWitnessCheckMs = 0;
        this.witnessBlocked = false;
        this.killReadyAtMs = firstKillAtMs;
    }
    decide(nowMs) {
        if (nowMs >= this.killReadyAtMs && this.hunt(nowMs))
            return;
        this.pretendToWork(nowMs);
    }
    nearestHero() {
        let best = null, bestDistance = Infinity;
        this.world.actorList().forEach((other) => {
            if (other === this.actor || !other.alive || this.world.roleOf(other.id) === "spy")
                return;
            const distance = Mathx.distance(this.actor.x, this.actor.z, other.x, other.z);
            if (distance < bestDistance) {
                best = other;
                bestDistance = distance;
            }
        });
        return best;
    }
    hasWitness(victim) {
        return this.world.actorList().some((other) => other !== this.actor && other !== victim && other.alive &&
            Mathx.distance(other.x, other.z, victim.x, victim.z) <= SpyBotBrain.WITNESS_RANGE &&
            this.world.canSee(other, victim.x, victim.z));
    }
    hunt(nowMs) {
        const victim = this.nearestHero();
        if (!victim)
            return false;
        if (nowMs >= this.repathAtMs) {
            this.goTo({ x: victim.x, z: victim.z });
            this.repathAtMs = nowMs + 600;
        }
        if (Mathx.distance(this.actor.x, this.actor.z, victim.x, victim.z) > CastleSpyConfig.KILL_RANGE - 0.4)
            return true;
        if (nowMs >= this.nextWitnessCheckMs) {
            this.witnessBlocked = this.hasWitness(victim) && this.world.random() < SpyBotBrain.WITNESS_SKIP_CHANCE;
            this.nextWitnessCheckMs = nowMs + 1000;
        }
        if (this.witnessBlocked)
            return true;
        this.world.killBy(this.actor.id, victim.id);
        this.actor.playAction(Actor.CLIP_STAB, 700, nowMs);
        this.killReadyAtMs = nowMs + CastleSpyConfig.KILL_COOLDOWN_MS;
        this.path = [];
        this.busyUntilMs = nowMs + 900;
        return true;
    }
    pretendToWork(nowMs) {
        if (this.path.length)
            return;
        const tasks = this.world.map.definition.tasks;
        this.goTo(this.world.map.taskPosition(Math.floor(this.world.random() * tasks.length)));
        this.busyUntilMs = nowMs + 1500 + this.world.random() * 2500;
    }
    resetAfterMeeting(nowMs) {
        super.resetAfterMeeting(nowMs);
        this.killReadyAtMs = nowMs + CastleSpyConfig.KILL_COOLDOWN_MS;
    }
}
SpyBotBrain.WITNESS_RANGE = 9;
SpyBotBrain.WITNESS_SKIP_CHANCE = 0.85;
class BotFactory {
    static create(role, actor, world, firstKillAtMs) {
        return role === "spy" ? new SpyBotBrain(actor, world, firstKillAtMs) : new HeroBotBrain(actor, world);
    }
}
class Match {
    constructor(s, session) {
        this.s = s;
        this.session = session;
        this.actors = new Map();
        this.bodies = new Map();
        this.brains = new Map();
        this.fakeDone = new Set();
        this.phase = "reveal";
        this.activeTask = null;
        this.finishedMeetings = 0;
        this.resultWrittenFor = 0;
        this.lastNetMs = 0;
        this.lastSentRaw = "";
        this.lastHostTickMs = 0;
        this.lastProgressRaw = "";
        this.revealShown = false;
        this.disposed = false;
        const match = session.match;
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
    applyChange(kind) {
        if (this.disposed)
            return;
        if (kind === "players")
            this.dropLeftPlayers();
        else if (kind === "roles")
            this.rolesChanged();
        else if (kind === "tasks" || kind === "done" || kind === "progress")
            this.refreshTaskHud();
        else if (kind === "dead" || kind === "out")
            this.syncDeaths();
        else if (kind === "host")
            this.adoptBotsIfHost();
    }
    receiveRemote(id, state) {
        const actor = this.actors.get(id);
        if (actor && !this.isLocalActor(actor))
            actor.receiveRemote(state.x, state.z, state.yaw, state.moving);
    }
    update(deltaSeconds) {
        if (this.disposed)
            return;
        const nowMs = this.s.backend.now();
        this.mapView.update(nowMs / 1000);
        this.showRoleRevealOnce();
        if (this.phase === "reveal" && nowMs >= this.startAtMs)
            this.phase = "play";
        this.driveMeeting(nowMs);
        if (this.phase === "play") {
            this.moveLocal(deltaSeconds);
            this.updateBots(deltaSeconds, nowMs);
            this.updateInteractions(nowMs);
        }
        if (this.activeTask)
            this.activeTask.update(deltaSeconds);
        this.sendState(nowMs);
        this.hostTick(nowMs);
        this.renderActors(deltaSeconds, nowMs);
        if (this.me)
            this.s.world.follow(this.me.x, this.me.z, deltaSeconds);
        this.s.world.render(deltaSeconds);
    }
    dispose() {
        this.disposed = true;
        if (this.activeTask)
            this.activeTask.abandon();
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
    actorList() {
        return Array.from(this.actors.values());
    }
    isAlive(id) {
        return this.session.isAlive(id);
    }
    roleOf(id) {
        return this.session.roles[id] || null;
    }
    assignedTasks(id) {
        return this.session.tasks[id] || [];
    }
    isTaskDone(id, taskIndex) {
        return this.session.done[taskIndex + "_" + id] !== undefined;
    }
    completeTask(id, taskIndex) {
        const key = taskIndex + "_" + id;
        this.session.done[key] = this.s.backend.now();
        this.session.ref.child("done/" + key).set(this.session.done[key]);
        this.refreshTaskHud();
    }
    killBy(spyId, victimId) {
        const victim = this.actors.get(victimId);
        if (!victim || !victim.alive)
            return;
        const record = { t: this.s.backend.now(), x: victim.x, z: victim.z, n: this.finishedMeetings };
        this.session.dead[victimId] = record;
        this.session.ref.child("dead/" + victimId).set(record);
        this.syncDeaths();
    }
    reportBy(callerId, bodyId) {
        this.callMeeting("report", callerId, bodyId);
    }
    bodyPositions() {
        return Array.from(this.bodies.entries()).map(([id, body]) => ({ id, x: body.x, z: body.z }));
    }
    canSee(viewer, x, z) {
        return Mathx.distance(viewer.x, viewer.z, x, z) <= CastleSpyConfig.VISION_RADIUS && this.map.hasLineOfSight(viewer.x, viewer.z, x, z);
    }
    participantIds() {
        return this.session.match.order.filter((id) => this.session.players.has(id));
    }
    myRole() {
        return this.session.roles[this.session.myId] || null;
    }
    isLocalActor(actor) {
        return actor === this.me || (this.session.isHost() && actor.record.isBot);
    }
    buildActors(match) {
        const ids = match.order.filter((id) => this.session.players.has(id));
        ids.forEach((id, index) => {
            const actor = new Actor(this.s.libs, this.s.factory, this.s.assets, this.s.labels, this.s.world.world, id, this.session.players.get(id));
            const spawn = this.map.spawnPoint(index, ids.length);
            actor.placeAt(spawn.x, spawn.z);
            this.actors.set(id, actor);
        });
    }
    adoptBotsIfHost() {
        if (!this.session.isHost()) {
            this.brains.clear();
            return;
        }
        if (!Object.keys(this.session.roles).some((id) => id !== this.session.myId))
            this.session.loadAllRoles().then(() => this.adoptBotsIfHost());
        this.actors.forEach((actor, id) => {
            const role = this.roleOf(id);
            if (actor.record.isBot && role && !this.brains.has(id))
                this.brains.set(id, BotFactory.create(role, actor, this, this.startAtMs + CastleSpyConfig.FIRST_KILL_DELAY_MS));
        });
    }
    dropLeftPlayers() {
        this.actors.forEach((actor, id) => {
            if (this.session.players.has(id))
                return;
            actor.dispose(this.s.world.world);
            this.actors.delete(id);
            this.brains.delete(id);
            if (this.session.isHost() && !this.session.dead[id] && this.session.out[id] === undefined) {
                const record = { t: this.s.backend.now(), x: actor.x, z: actor.z, n: this.finishedMeetings, left: 1 };
                this.session.ref.child("dead/" + id).set(record);
            }
        });
    }
    rolesChanged() {
        const role = this.myRole();
        this.s.hud.setRole(role);
        if (this.me)
            this.me.role = role;
        this.refreshTaskHud();
        this.adoptBotsIfHost();
    }
    showRoleRevealOnce() {
        const role = this.myRole();
        if (this.revealShown || !role || this.phase !== "reveal")
            return;
        this.revealShown = true;
        this.s.hud.setRole(role);
        const partners = role === "spy" ? this.participantIds().filter((id) => id !== this.session.myId && this.roleOf(id) === "spy").map((id) => this.session.players.get(id).nick) : [];
        this.s.hud.showRoleReveal(role, partners, Math.max(1500, this.startAtMs - this.s.backend.now()));
    }
    pendingTasksOfMe() {
        const id = this.session.myId;
        return this.assignedTasks(id).filter((index) => !(this.myRole() === "spy" ? this.fakeDone.has(index) : this.isTaskDone(id, index)));
    }
    refreshTaskHud() {
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
    syncDeaths() {
        const meetingCount = this.session.meeting ? this.session.meeting.n : 0;
        this.actors.forEach((actor, id) => {
            const gone = !!this.session.dead[id] || this.session.out[id] !== undefined;
            if (gone && actor.alive) {
                actor.alive = false;
                if (id === this.session.myId)
                    this.onMyDeath();
            }
        });
        Object.keys(this.session.dead).forEach((id) => {
            const record = this.session.dead[id];
            const wanted = !record.left && record.n === meetingCount && this.session.players.has(id);
            const shown = this.bodies.get(id);
            if (wanted && !shown) {
                this.bodies.set(id, new BodyView(this.s.libs, this.s.factory, this.s.assets, this.s.world.world, this.session.players.get(id), record.x, record.z));
            }
            else if (!wanted && shown) {
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
    onMyDeath() {
        if (this.activeTask)
            this.activeTask.abandon();
        this.s.hud.showBanner("당했어요! 유령이 되어 남은 할 일을 도울 수 있어요", 4500);
    }
    moveLocal(deltaSeconds) {
        const me = this.me;
        if (!me)
            return;
        const axis = this.s.input.axis();
        const length = Math.hypot(axis.x, axis.z);
        me.moving = length > 0.05 && !this.activeTask;
        if (!me.moving)
            return;
        const speed = CastleSpyConfig.MOVE_SPEED * Math.min(1, length) * (me.alive ? 1 : 1.15);
        const deltaX = (axis.x / length) * speed * deltaSeconds, deltaZ = (axis.z / length) * speed * deltaSeconds;
        if (me.alive) {
            const moved = this.map.move(me.x, me.z, deltaX, deltaZ, CastleSpyConfig.PLAYER_RADIUS);
            me.x = moved.x;
            me.z = moved.z;
        }
        else {
            me.x = Mathx.clamp(me.x + deltaX, this.map.worldX(1), this.map.worldX(this.map.columns - 1));
            me.z = Mathx.clamp(me.z + deltaZ, this.map.worldZ(1), this.map.worldZ(this.map.rowCount - 1));
        }
        me.yaw = Math.atan2(deltaX, deltaZ);
    }
    updateBots(deltaSeconds, nowMs) {
        if (!this.session.isHost())
            return;
        this.brains.forEach((brain) => {
            if (brain.actor.alive || this.roleOf(brain.actor.id) === "hero")
                brain.step(deltaSeconds, nowMs);
        });
    }
    nearestPendingTask() {
        const me = this.me;
        if (!me)
            return null;
        let best = null, bestDistance = CastleSpyConfig.TASK_RANGE;
        this.pendingTasksOfMe().forEach((index) => {
            const position = this.map.taskPosition(index);
            const distance = Mathx.distance(me.x, me.z, position.x, position.z);
            if (distance <= bestDistance) {
                best = index;
                bestDistance = distance;
            }
        });
        return best;
    }
    nearTable() {
        const me = this.me;
        if (!me)
            return false;
        const table = this.map.tablePosition();
        return Mathx.distance(me.x, me.z, table.x, table.z) <= CastleSpyConfig.TABLE_RANGE;
    }
    emergencyAvailable(nowMs) {
        const me = this.me;
        return !!me && me.alive && !this.session.buttonUsed[this.session.myId] && nowMs >= this.emergencyReadyAtMs && this.nearTable();
    }
    nearestBodyInReach() {
        const me = this.me;
        if (!me || !me.alive)
            return null;
        let best = null, bestDistance = CastleSpyConfig.REPORT_RANGE;
        this.bodies.forEach((body, id) => {
            const distance = Mathx.distance(me.x, me.z, body.x, body.z);
            if (distance <= bestDistance && this.map.hasLineOfSight(me.x, me.z, body.x, body.z)) {
                best = id;
                bestDistance = distance;
            }
        });
        return best;
    }
    killTargetInReach() {
        const me = this.me;
        if (!me || !me.alive || this.myRole() !== "spy")
            return null;
        let best = null, bestDistance = CastleSpyConfig.KILL_RANGE;
        this.actors.forEach((actor) => {
            if (actor === me || !actor.alive || this.roleOf(actor.id) === "spy")
                return;
            const distance = Mathx.distance(me.x, me.z, actor.x, actor.z);
            if (distance <= bestDistance) {
                best = actor;
                bestDistance = distance;
            }
        });
        return best;
    }
    updateInteractions(nowMs) {
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
    useAction() {
        if (this.phase !== "play" || this.activeTask || !this.me)
            return;
        const nowMs = this.s.backend.now();
        const task = this.nearestPendingTask();
        if (task !== null) {
            const spot = this.map.definition.tasks[task];
            this.s.input.releaseAll();
            this.me.moving = false;
            this.activeTask = TaskGameCatalog.create(spot.kind, this.s.taskOverlay, spot.roomName + " · " + spot.title, (completed) => this.taskFinished(task, completed));
            this.activeTask.open();
        }
        else if (this.emergencyAvailable(nowMs)) {
            this.session.buttonUsed[this.session.myId] = true;
            this.session.ref.child("buttonUsed/" + this.session.myId).set(true);
            this.callMeeting("button", this.session.myId, null);
        }
    }
    taskFinished(taskIndex, completed) {
        this.activeTask = null;
        if (!completed)
            return;
        if (this.myRole() === "spy") {
            this.fakeDone.add(taskIndex);
            this.refreshTaskHud();
        }
        else {
            this.completeTask(this.session.myId, taskIndex);
        }
    }
    reportAction() {
        if (this.phase !== "play" || this.activeTask)
            return;
        const body = this.nearestBodyInReach();
        if (body)
            this.callMeeting("report", this.session.myId, body);
    }
    killAction() {
        if (this.phase !== "play" || this.activeTask || !this.me)
            return;
        const nowMs = this.s.backend.now();
        const target = this.killTargetInReach();
        if (!target || nowMs < this.killReadyAtMs)
            return;
        this.killBy(this.session.myId, target.id);
        this.me.playAction(Actor.CLIP_STAB, 700, nowMs);
        this.killReadyAtMs = nowMs + CastleSpyConfig.KILL_COOLDOWN_MS;
    }
    callMeeting(kind, callerId, bodyId) {
        if (this.phase !== "play")
            return;
        const nextNumber = (this.session.meeting ? this.session.meeting.n : 0) + 1;
        const record = { n: nextNumber, kind, caller: callerId, body: bodyId, at: this.s.backend.now() };
        this.session.ref.child("meeting").transaction((current) => {
            const existing = current;
            return existing && existing.n >= nextNumber ? undefined : record;
        });
    }
    meetingPhase(nowMs) {
        const meeting = this.session.meeting;
        if (!meeting || meeting.n <= this.finishedMeetings || this.session.status !== "play")
            return "none";
        const result = this.session.result;
        if (result && result.n === meeting.n)
            return nowMs < result.at + CastleSpyConfig.RESULT_MS ? "result" : "finished";
        return nowMs < meeting.at + CastleSpyConfig.TALK_MS ? "talk" : "vote";
    }
    driveMeeting(nowMs) {
        const meeting = this.session.meeting;
        const phase = this.meetingPhase(nowMs);
        if (phase === "none")
            return;
        if (phase === "finished") {
            this.leaveMeeting(nowMs);
            return;
        }
        if (this.phase !== "meeting" && this.phase !== "ended")
            this.enterMeeting();
        if (this.phase !== "meeting" || !meeting)
            return;
        this.hostCountVotes(nowMs, meeting, phase);
        this.renderMeeting(nowMs, meeting, phase);
    }
    enterMeeting() {
        this.phase = "meeting";
        if (this.activeTask)
            this.activeTask.abandon();
        this.s.input.releaseAll();
        this.s.input.enabled = false;
        if (this.me)
            this.me.moving = false;
        this.s.hud.setUseLabel(null);
        this.s.hud.setReportVisible(false);
        this.s.hud.setKill(false, false, 0);
        this.s.meetingView.open();
    }
    leaveMeeting(nowMs) {
        const meeting = this.session.meeting;
        this.finishedMeetings = meeting.n;
        if (this.phase === "meeting")
            this.phase = "play";
        this.s.input.enabled = true;
        this.s.meetingView.close();
        const alive = this.participantIds().filter((id) => this.actors.has(id) && this.session.isAlive(id));
        alive.forEach((id, index) => {
            const spawn = this.map.spawnPoint(index, alive.length);
            this.actors.get(id).placeAt(spawn.x, spawn.z);
        });
        this.s.world.snapCamera();
        this.killReadyAtMs = nowMs + CastleSpyConfig.KILL_COOLDOWN_MS;
        this.emergencyReadyAtMs = nowMs + Match.EMERGENCY_GAP_AFTER_MEETING_MS;
        this.brains.forEach((brain) => brain.resetAfterMeeting(nowMs));
        this.syncDeaths();
        if (this.session.out[this.session.myId] !== undefined)
            this.s.hud.showBanner("추방되었어요. 유령이 되어 할 일을 도울 수 있어요", 4500);
        this.hostCheckWin();
    }
    votesOf(meetingNumber) {
        return this.session.votes[String(meetingNumber)] || {};
    }
    hostCountVotes(nowMs, meeting, phase) {
        if (!this.session.isHost() || phase !== "vote" || this.resultWrittenFor >= meeting.n)
            return;
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
        if (!everyoneVoted && nowMs < voteStartMs + CastleSpyConfig.VOTE_MS)
            return;
        this.resultWrittenFor = meeting.n;
        const tally = MatchRules.tally(votes, aliveIds);
        const ejected = tally.ejected;
        const result = { n: meeting.n, ejected, wasSpy: !!ejected && this.roleOf(ejected) === "spy", at: nowMs, counts: tally.counts };
        const updates = { result };
        if (ejected)
            updates["out/" + ejected] = meeting.n;
        this.session.ref.update(updates);
    }
    castVote(target) {
        const meeting = this.session.meeting;
        const me = this.me;
        if (this.phase !== "meeting" || !meeting || !me || !me.alive)
            return;
        const nowMs = this.s.backend.now();
        if (this.meetingPhase(nowMs) !== "vote")
            return;
        const votes = this.votesOf(meeting.n);
        if (votes[this.session.myId])
            return;
        if (target !== CastleSpyConfig.VOTE_SKIP && !this.session.isAlive(target))
            return;
        if (!this.session.votes[String(meeting.n)])
            this.session.votes[String(meeting.n)] = {};
        this.session.votes[String(meeting.n)][this.session.myId] = target;
        this.session.ref.child("votes/" + meeting.n + "/" + this.session.myId).set(target);
    }
    renderMeeting(nowMs, meeting, phase) {
        const votes = this.votesOf(meeting.n);
        const result = this.session.result && this.session.result.n === meeting.n ? this.session.result : null;
        const callerNick = (this.session.players.get(meeting.caller) || { nick: "누군가" }).nick;
        const bodyNick = meeting.body ? (this.session.players.get(meeting.body) || { nick: "누군가" }).nick : "";
        const title = meeting.kind === "report" ? callerNick + "님이 " + bodyNick + "님의 시체를 발견했어요!" : callerNick + "님이 긴급 회의를 열었어요!";
        const me = this.me;
        const cards = this.session.match.order.filter((id) => this.session.players.has(id)).map((id) => {
            const record = this.session.players.get(id);
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
        if (phase === "talk")
            secondsLeft = (meeting.at + CastleSpyConfig.TALK_MS - nowMs) / 1000;
        else if (phase === "vote")
            secondsLeft = (meeting.at + CastleSpyConfig.TALK_MS + CastleSpyConfig.VOTE_MS - nowMs) / 1000;
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
    sendState(nowMs) {
        const me = this.me;
        if (!me || nowMs - this.lastNetMs < CastleSpyConfig.NET_MS)
            return;
        this.lastNetMs = nowMs;
        this.writeStateOf(me, true);
        if (this.session.isHost())
            this.brains.forEach((brain) => this.writeStateOf(brain.actor, false));
    }
    writeStateOf(actor, mine) {
        const raw = StateCodec.encode(actor.x, actor.z, actor.yaw, actor.moving);
        if (mine) {
            if (raw === this.lastSentRaw && Math.random() > 0.1)
                return;
            this.lastSentRaw = raw;
            this.session.writeState(raw);
        }
        else {
            this.session.ref.child("st/" + actor.id).set(raw);
        }
    }
    taskProgress() {
        let done = 0, total = 0;
        this.participantIds().forEach((id) => {
            if (this.roleOf(id) !== "hero")
                return;
            const tasks = this.assignedTasks(id);
            total += tasks.length;
            tasks.forEach((index) => { if (this.isTaskDone(id, index))
                done++; });
        });
        return { done, total };
    }
    hostTick(nowMs) {
        if (!this.session.isHost() || this.phase === "ended" || nowMs - this.lastHostTickMs < Match.HOST_TICK_MS)
            return;
        this.lastHostTickMs = nowMs;
        const progress = this.taskProgress();
        const raw = progress.done + "/" + progress.total;
        if (raw !== this.lastProgressRaw && progress.total > 0) {
            this.lastProgressRaw = raw;
            this.session.ref.child("progress").set(progress);
        }
        if (this.phase === "play")
            this.hostCheckWin();
    }
    hostCheckWin() {
        if (!this.session.isHost() || this.session.status !== "play" || this.phase === "ended")
            return;
        const ids = this.participantIds();
        if (ids.some((id) => this.roleOf(id) === null))
            return;
        const aliveHeroes = ids.filter((id) => this.roleOf(id) === "hero" && this.session.isAlive(id)).length;
        const aliveSpies = ids.filter((id) => this.roleOf(id) === "spy" && this.session.isAlive(id)).length;
        const progress = this.taskProgress();
        const verdict = MatchRules.winner(aliveHeroes, aliveSpies, progress.done, progress.total);
        if (!verdict)
            return;
        const spies = ids.filter((id) => this.roleOf(id) === "spy");
        const end = { winner: verdict.winner, reason: verdict.reason, at: this.s.backend.now(), spies };
        this.session.ref.update({ status: "end", end });
    }
    markEnded() {
        this.phase = "ended";
        if (this.activeTask)
            this.activeTask.abandon();
        this.s.input.releaseAll();
        this.s.input.enabled = false;
        this.s.meetingView.close();
        this.s.hud.setUseLabel(null);
        this.s.hud.setReportVisible(false);
        this.s.hud.setKill(false, false, 0);
    }
    renderActors(deltaSeconds, nowMs) {
        const me = this.me;
        const viewerIsGhost = !me || !me.alive;
        this.actors.forEach((actor) => {
            if (!this.isLocalActor(actor))
                actor.stepRemote(deltaSeconds);
            actor.setGhost(!actor.alive);
            if (actor === me)
                actor.setVisible(true);
            else if (viewerIsGhost)
                actor.setVisible(true);
            else
                actor.setVisible(actor.alive && this.canSee(me, actor.x, actor.z));
            actor.render(deltaSeconds, nowMs);
        });
        this.bodies.forEach((body) => {
            body.update(deltaSeconds);
            body.group.visible = viewerIsGhost || this.canSee(me, body.x, body.z);
        });
    }
}
Match.HOST_TICK_MS = 500;
Match.EMERGENCY_GAP_AFTER_MEETING_MS = 10000;
class ScreenManager {
    constructor(touchDevice) {
        this.touchDevice = touchDevice;
        this.start = Dom.byId("startScreen");
        this.lobby = Dom.byId("lobbyScreen");
        this.end = Dom.byId("endScreen");
        this.gameUi = Dom.byId("gameUi");
        this.joystickZone = Dom.byId("joyZone");
        this.current = "start";
    }
    show(name) {
        this.current = name;
        Dom.show(this.start, name === "start");
        Dom.show(this.lobby, name === "lobby");
        Dom.show(this.end, name === "end");
        Dom.show(this.gameUi, name === "game");
        Dom.show(this.joystickZone, name === "game" && this.touchDevice);
    }
}
class LobbyView {
    constructor() {
        this.code = Dom.byId("lobbyCode");
        this.playerBox = Dom.byId("lobbyPlayers");
        this.mapRow = Dom.byId("mapRow");
        this.mapOptions = Dom.byId("mapOpts");
        this.botRow = Dom.byId("botRow");
        this.startButton = Dom.byId("btnStart");
        this.hint = Dom.byId("lobbyHint");
        this.onPickMap = () => undefined;
        this.mapOptions.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-map]");
            if (button)
                this.onPickMap(button.dataset.map);
        });
    }
    render(session) {
        const isHost = session.isHost();
        const count = session.players.size;
        Dom.setText(this.code, session.code);
        this.playerBox.innerHTML = session.order().map((id) => {
            const record = session.players.get(id);
            const color = CastleSpyConfig.SLOT_COLORS[record.slot % CastleSpyConfig.SLOT_COLORS.length];
            const tag = id === session.hostId ? "방장" : record.isBot ? "AI" : "";
            return "<div class='plRow" + (id === session.myId ? " me" : "") + "'><i style='background:" + color + "'></i><b>" + Dom.escape(record.nick) + "</b><small>" + tag + "</small></div>";
        }).join("");
        Dom.show(this.botRow, isHost);
        Dom.show(this.mapRow, isHost && MapCatalog.ALL.length > 1);
        this.mapOptions.innerHTML = MapCatalog.ALL.map((definition) => "<button type='button' data-map='" + definition.id + "' class='" + (definition.id === session.mapId ? "on" : "") + "'>" + Dom.escape(definition.name) + "</button>").join("");
        const enough = count >= CastleSpyConfig.MIN_PLAYERS;
        Dom.show(this.startButton, isHost);
        this.startButton.disabled = !enough;
        Dom.setText(this.hint, isHost
            ? (enough ? count + "명이 모였어요. 시작할 수 있어요!" : "최소 " + CastleSpyConfig.MIN_PLAYERS + "명이 필요해요. 친구를 기다리거나 AI를 추가하세요. (" + count + "/" + CastleSpyConfig.MAX_PLAYERS + ")")
            : "방장이 시작하길 기다리는 중이에요… (" + count + "/" + CastleSpyConfig.MAX_PLAYERS + ")");
    }
}
class EndView {
    constructor() {
        this.title = Dom.byId("endTitle");
        this.reason = Dom.byId("endReason");
        this.rows = Dom.byId("endRows");
        this.toLobby = Dom.byId("btnToLobby");
        this.hint = Dom.byId("endHint");
    }
    render(session, end) {
        const myRole = end.spies.indexOf(session.myId) >= 0 ? "spy" : "hero";
        const mine = myRole === end.winner;
        Dom.setText(this.title, (end.winner === "hero" ? "용사 승리!" : "스파이 승리!") + (mine ? "  (내가 이겼어요)" : "  (아쉬워요)"));
        Dom.setText(this.reason, end.reason);
        const order = session.match ? session.match.order : session.order();
        this.rows.innerHTML = order.filter((id) => session.players.has(id)).map((id) => {
            const record = session.players.get(id);
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
    constructor(services) {
        this.services = services;
        this.view = null;
        this.map = null;
        this.seconds = 0;
    }
    prepare() {
        if (this.view)
            return;
        this.map = new GameMap(MapCatalog.ALL[0]);
        this.view = new MapView(this.services.libs, this.services.scenery, this.services.labels, this.map);
        this.view.showTasks(new Set());
        this.services.world.world.add(this.view.group);
    }
    render(deltaSeconds) {
        const map = this.map;
        if (!this.view || !map)
            return;
        this.seconds += deltaSeconds;
        this.view.group.visible = true;
        this.view.update(this.seconds);
        const angle = this.seconds / MenuBackdrop.ORBIT_SECONDS * Math.PI * 2;
        this.services.world.orbit(map.columns * map.cell / 2, map.rowCount * map.cell / 2, MenuBackdrop.RADIUS, MenuBackdrop.HEIGHT, angle);
        this.services.world.render(deltaSeconds);
    }
    hide() {
        if (this.view)
            this.view.group.visible = false;
    }
}
MenuBackdrop.ORBIT_SECONDS = 80;
MenuBackdrop.RADIUS = 34;
MenuBackdrop.HEIGHT = 30;
class CastleSpyGame {
    constructor(libs) {
        this.libs = libs;
        this.touchDevice = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
        this.profile = new PlayerProfile();
        this.backend = new Backend();
        this.directory = new RoomDirectory(this.backend);
        this.screens = new ScreenManager(this.touchDevice);
        this.lobbyView = new LobbyView();
        this.endView = new EndView();
        this.myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        this.session = null;
        this.match = null;
        this.assetsReady = false;
        this.lastFrameMs = 0;
        this.loop = (timeMs) => {
            this.step(timeMs);
            requestAnimationFrame(this.loop);
        };
        this.assets = new CharacterAssets(libs);
        this.factory = new CharacterModelFactory(libs, this.assets);
        this.scenery = new SceneryAssets(libs);
        this.labels = new LabelFactory(libs);
        this.world = new WorldView(libs, Dom.byId("view"), this.touchDevice);
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
        window.setInterval(() => { if (document.hidden)
            this.step(performance.now()); }, 250);
        window.addEventListener("pagehide", () => { if (this.session)
            this.session.removeMineOnUnload(); });
    }
    async loadAssets() {
        const modelNames = new Set(SceneryAssets.DECOR_MODELS);
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
        }
        catch (error) {
            Dom.setText(Dom.byId("loadNote"), "캐릭터를 불러오지 못했어요. 새로고침해 주세요.");
        }
    }
    bindMenus() {
        Dom.byId("btnCreate").addEventListener("click", () => this.createRoom());
        Dom.byId("btnJoin").addEventListener("click", () => this.joinRoom());
        Dom.byId("joinCode").addEventListener("keydown", (event) => { if (event.key === "Enter")
            this.joinRoom(); });
        Dom.byId("btnStart").addEventListener("click", () => this.startMatch());
        Dom.byId("btnLeave").addEventListener("click", () => this.leaveRoom());
        Dom.byId("btnEndLeave").addEventListener("click", () => this.leaveRoom());
        Dom.byId("btnToLobby").addEventListener("click", () => this.returnToLobby());
        Dom.byId("btnAddBot").addEventListener("click", () => this.addBot());
        Dom.byId("btnRemoveBot").addEventListener("click", () => this.removeBot());
        this.lobbyView.onPickMap = (mapId) => { if (this.session && this.session.isHost())
            this.session.ref.update({ mapId }); };
    }
    updateStartButtons() {
        const ok = !!this.backend.database && this.assetsReady;
        Dom.byId("btnCreate").disabled = !ok;
        Dom.byId("btnJoin").disabled = !ok;
        if (!this.backend.database)
            this.showStartMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
    }
    showStartMessage(text) {
        Dom.setText(Dom.byId("startMsg"), text);
    }
    myRecord() {
        return { nick: this.profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: this.profile.look };
    }
    pushProfile() {
        if (this.session)
            this.session.pushProfile({ nick: this.profile.nickOrDefault(), look: this.profile.look });
    }
    async createRoom() {
        if (!this.backend.database)
            return;
        this.showStartMessage("");
        const button = Dom.byId("btnCreate");
        button.disabled = true;
        try {
            const code = await this.directory.create(this.myId, this.myRecord());
            if (code)
                this.enterRoom(code);
            else
                this.showStartMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
        }
        catch (error) {
            this.showStartMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
        }
        button.disabled = false;
    }
    async joinRoom() {
        if (!this.backend.database)
            return;
        const code = Dom.byId("joinCode").value.replace(/\D/g, "");
        if (code.length !== 5) {
            this.showStartMessage("방 코드 5자리를 입력해 주세요.");
            return;
        }
        this.showStartMessage("");
        try {
            const outcome = await this.directory.join(code, this.myId, this.myRecord());
            if (outcome.ok)
                this.enterRoom(code);
            else
                this.showStartMessage(outcome.message);
        }
        catch (error) {
            this.showStartMessage("방을 불러오지 못했어요.");
        }
    }
    enterRoom(code) {
        const session = new RoomSession(this.backend, code, this.myId);
        this.session = session;
        session.onChange = (kind) => this.onSessionChange(kind);
        session.onRemoteState = (id, state) => { if (this.match)
            this.match.receiveRemote(id, state); };
        session.onClosed = (message) => this.exitToStart(message);
        session.connect();
        this.showLobby();
    }
    showLobby() {
        this.screens.show("lobby");
        this.editor.mount(Dom.byId("lobbyProfileHost"));
        this.editor.setActive(true);
        if (this.session)
            this.lobbyView.render(this.session);
    }
    showStart(message) {
        this.screens.show("start");
        this.editor.mount(Dom.byId("profileHost"));
        this.editor.setActive(true);
        this.showStartMessage(message);
    }
    onSessionChange(kind) {
        const session = this.session;
        if (!session)
            return;
        if (this.screens.current === "lobby" && (kind === "players" || kind === "host" || kind === "map" || kind === "status"))
            this.lobbyView.render(session);
        if (kind === "status" || kind === "match" || kind === "end")
            this.syncPhase();
        if (this.match)
            this.match.applyChange(kind);
    }
    syncPhase() {
        const session = this.session;
        if (!session)
            return;
        if (session.status === "lobby") {
            if (this.match)
                this.disposeMatch();
            if (this.screens.current !== "lobby")
                this.showLobby();
            this.lobbyView.render(session);
        }
        else if (session.status === "play" && session.match && !this.match) {
            if (session.match.order.indexOf(session.myId) < 0) {
                this.exitToStart("이미 게임이 시작되어 들어갈 수 없어요.");
                return;
            }
            this.editor.setActive(false);
            this.match = new Match(this.services, session);
            this.screens.show("game");
        }
        else if (session.status === "end" && session.end && this.screens.current !== "end") {
            if (this.match)
                this.match.markEnded();
            this.endView.render(session, session.end);
            this.screens.show("end");
        }
    }
    disposeMatch() {
        if (this.match)
            this.match.dispose();
        this.match = null;
    }
    startMatch() {
        const session = this.session;
        if (!session || !session.isHost())
            return;
        const ids = session.order();
        if (ids.length < CastleSpyConfig.MIN_PLAYERS || ids.length > CastleSpyConfig.MAX_PLAYERS)
            return;
        const definition = MapCatalog.byId(session.mapId);
        const seed = 1 + Math.floor(Math.random() * 1000000000);
        const random = Mathx.seededRandom(seed);
        const roles = MatchRules.assignRoles(ids, random);
        const tasks = MatchRules.assignTasks(ids, definition.tasks.length, CastleSpyConfig.TASKS_PER_PLAYER, random);
        const match = { id: seed, startAt: this.backend.now() + CastleSpyConfig.ROLE_REVEAL_MS, mapId: definition.id, order: ids };
        Object.assign(session.roles, roles);
        session.ref.update({
            status: "play", match, roles, tasks,
            st: null, done: null, dead: null, out: null, buttonUsed: null, meeting: null, votes: null, result: null, end: null, progress: null
        });
    }
    returnToLobby() {
        const session = this.session;
        if (!session || !session.isHost())
            return;
        session.ref.update({
            status: "lobby", match: null, roles: null, tasks: null,
            st: null, done: null, dead: null, out: null, buttonUsed: null, meeting: null, votes: null, result: null, end: null, progress: null
        });
    }
    addBot() {
        const session = this.session;
        if (!session || !session.isHost() || session.players.size >= CastleSpyConfig.MAX_PLAYERS)
            return;
        const usedNicks = new Set();
        session.players.forEach((record) => usedNicks.add(record.nick));
        const nick = CastleSpyConfig.BOT_NAMES.filter((name) => !usedNicks.has(name))[0] || "AI";
        const record = { nick, isBot: true, joinedAt: this.backend.now() + 1, slot: session.freeSlot(), look: CharacterLooks.random() };
        session.ref.child("players/bot" + Math.random().toString(36).slice(2, 8)).set(record);
    }
    removeBot() {
        const session = this.session;
        if (!session || !session.isHost())
            return;
        const bots = session.order().filter((id) => session.players.get(id).isBot);
        const last = bots[bots.length - 1];
        if (last)
            session.ref.child("players/" + last).remove();
    }
    leaveRoom() {
        if (this.session)
            this.session.leave();
        this.session = null;
        this.disposeMatch();
        this.showStart("");
    }
    exitToStart(message) {
        if (this.session)
            this.session.silentClose();
        this.session = null;
        this.disposeMatch();
        this.showStart(message);
    }
    step(timeMs) {
        const deltaSeconds = Math.min(0.1, Math.max(0, (timeMs - this.lastFrameMs) / 1000));
        this.lastFrameMs = timeMs;
        if (this.match) {
            this.backdrop.hide();
            this.match.update(deltaSeconds);
        }
        else {
            this.backdrop.render(deltaSeconds);
        }
    }
}
