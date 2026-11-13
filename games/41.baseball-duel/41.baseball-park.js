"use strict";
class BbScatter {
    constructor(seed) { this.state = seed >>> 0; }
    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let mixed = this.state;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    }
    between(low, high) { return low + (high - low) * this.next(); }
    pick(items) { return items[Math.floor(this.next() * items.length)]; }
}
class BbParkOutline {
    constructor(dimensions) {
        this.dimensions = dimensions;
        this.fence = [];
        this.rightSide = [];
        this.back = [];
        this.leftSide = [];
        const foul = BbFieldGeometry.FOUL_LINE_DEGREES, width = dimensions.foulTerritoryWidth, diagonal = Math.SQRT1_2;
        for (let degrees = -foul; degrees <= foul + 1e-6; degrees += 1.5)
            this.fence.push(BbParkOutline.polar(dimensions.fenceDistance(degrees), degrees));
        const poleDistance = dimensions.fenceDistance(foul);
        const alongRight = (along, out) => [along * diagonal + out * diagonal, along * diagonal - out * diagonal];
        this.rightSide.push(alongRight(poleDistance, 0), alongRight(poleDistance * 0.62, width), alongRight(0, width));
        for (let degrees = 135 + 7.5; degrees < 225 - 1e-6; degrees += 7.5)
            this.back.push(BbParkOutline.polar(width, degrees));
        this.leftSide = this.rightSide.map(([x, z]) => [-x, z]).reverse();
        this.loop = [...this.fence, ...this.rightSide.slice(1), ...this.back, ...this.leftSide.slice(0, -1)];
    }
    static polar(distance, degrees) {
        const radians = degrees * Math.PI / 180;
        return [distance * Math.sin(radians), distance * Math.cos(radians)];
    }
    outward(index) {
        const count = this.loop.length, before = this.loop[(index + count - 1) % count], after = this.loop[(index + 1) % count];
        const dx = after[0] - before[0], dz = after[1] - before[1], size = Math.hypot(dx, dz) || 1;
        return [-dz / size, dx / size];
    }
    wallHeightAt(index) {
        return index < this.fence.length ? this.dimensions.wallHeight : BbParkOutline.SIDE_WALL_HEIGHT;
    }
}
BbParkOutline.SIDE_WALL_HEIGHT = 1.3;
class BbFieldCanvas {
    constructor(pixels, centerX, centerZ, span) {
        this.pixels = pixels;
        this.centerX = centerX;
        this.centerZ = centerZ;
        this.span = span;
        this.canvas = document.createElement("canvas");
        this.canvas.width = this.canvas.height = pixels;
        this.context = this.canvas.getContext("2d");
        this.pixelsPerMeter = pixels / span;
    }
    x(fieldX) { return (fieldX - this.centerX + this.span / 2) * this.pixelsPerMeter; }
    y(fieldZ) { return (this.centerZ + this.span / 2 - fieldZ) * this.pixelsPerMeter; }
    size(meters) { return meters * this.pixelsPerMeter; }
    trace(points, close) {
        const context = this.context;
        context.beginPath();
        points.forEach(([x, z], index) => { if (index)
            context.lineTo(this.x(x), this.y(z));
        else
            context.moveTo(this.x(x), this.y(z)); });
        if (close)
            context.closePath();
    }
    disc(fieldX, fieldZ, radius) {
        this.context.beginPath();
        this.context.arc(this.x(fieldX), this.y(fieldZ), this.size(radius), 0, Math.PI * 2);
    }
}
class BbGroundPainter {
    constructor(outline) {
        this.outline = outline;
    }
    paint(surface, fineDetail) {
        const context = surface.context;
        context.fillStyle = BbGroundPainter.APRON;
        context.fillRect(0, 0, surface.pixels, surface.pixels);
        context.save();
        surface.trace(this.outline.loop, true);
        context.clip();
        this.mow(surface);
        this.mottle(surface);
        this.paintWarningTrack(surface);
        this.paintInfield(surface);
        this.paintWear(surface);
        this.speckle(surface, fineDetail);
        this.paintWallShade(surface);
        if (fineDetail)
            this.paintChalk(surface);
        context.restore();
    }
    mow(surface) {
        const context = surface.context, width = BbGroundPainter.STRIPE_WIDTH, reach = BbGroundPainter.MOW_REACH, slant = Math.SQRT1_2;
        context.fillStyle = BbGroundPainter.GRASS;
        context.fillRect(0, 0, surface.pixels, surface.pixels);
        context.fillStyle = BbGroundPainter.MOW_SHEEN;
        [1, -1].forEach((side) => {
            const along = [side * slant, slant], across = [slant, -side * slant];
            for (let shift = -reach; shift < reach; shift += width * 2) {
                const corner = (step, sign) => [across[0] * (shift + step) + along[0] * reach * sign, across[1] * (shift + step) + along[1] * reach * sign];
                surface.trace([corner(0, -1), corner(0, 1), corner(width, 1), corner(width, -1)], true);
                context.fill();
            }
        });
    }
    mottle(surface) {
        const context = surface.context, random = new BbScatter(7203);
        for (let index = 0; index < 320; index++) {
            const x = random.between(-110, 110), z = random.between(-25, 135), radius = random.between(3, 10), dark = random.next() < 0.5;
            const patch = context.createRadialGradient(surface.x(x), surface.y(z), 0, surface.x(x), surface.y(z), surface.size(radius));
            patch.addColorStop(0, dark ? "rgba(20,50,15,0.07)" : "rgba(215,235,150,0.06)");
            patch.addColorStop(1, dark ? "rgba(20,50,15,0)" : "rgba(215,235,150,0)");
            context.fillStyle = patch;
            surface.disc(x, z, radius);
            context.fill();
        }
    }
    dirtShape(surface) {
        const context = surface.context;
        context.strokeStyle = BbGroundPainter.GRASS_LIP;
        context.lineWidth = surface.size(BbGroundPainter.LIP_WIDTH);
        context.stroke();
        context.fillStyle = BbGroundPainter.DIRT;
        context.fill();
    }
    paintWarningTrack(surface) {
        const context = surface.context;
        context.lineJoin = "round";
        context.strokeStyle = BbGroundPainter.TRACK;
        context.lineWidth = surface.size(this.outline.dimensions.warningTrackWidth * 2);
        surface.trace(this.outline.loop, true);
        context.stroke();
    }
    paintInfield(surface) {
        const context = surface.context, offset = BbFieldGeometry.BASE_OFFSET, inset = BbGroundPainter.PATH_INSET * Math.SQRT2;
        context.save();
        surface.trace([[0, -4], [-40, 34], [-40, 60], [40, 60], [40, 34]], true);
        context.clip();
        surface.disc(0, BbFieldGeometry.RUBBER_DISTANCE, BbFieldGeometry.INFIELD_DIRT_RADIUS);
        this.dirtShape(surface);
        context.restore();
        const diamond = [[0, inset], [offset - inset, offset], [0, offset * 2 - inset], [-offset + inset, offset]];
        context.save();
        surface.trace(diamond, true);
        context.clip();
        this.mow(surface);
        context.strokeStyle = BbGroundPainter.GRASS_LIP;
        context.lineWidth = surface.size(BbGroundPainter.LIP_WIDTH);
        surface.trace(diamond, true);
        context.stroke();
        context.restore();
        const cutouts = [[offset, offset], [0, offset * 2], [-offset, offset]];
        cutouts.forEach(([x, z]) => { surface.disc(x, z, BbGroundPainter.BASE_CUTOUT); context.fillStyle = BbGroundPainter.DIRT; context.fill(); });
        surface.disc(0, 0, BbFieldGeometry.HOME_DIRT_RADIUS);
        this.dirtShape(surface);
        surface.disc(0, BbFieldGeometry.RUBBER_DISTANCE, BbFieldGeometry.MOUND_RADIUS);
        this.dirtShape(surface);
        context.strokeStyle = BbGroundPainter.DIRT;
        context.lineWidth = surface.size(1.9);
        surface.trace([[0, 0], [offset, offset]], false);
        context.stroke();
        surface.trace([[0, 0], [-offset, offset]], false);
        context.stroke();
    }
    paintWear(surface) {
        const context = surface.context, offset = BbFieldGeometry.BASE_OFFSET;
        const worn = [[offset, offset, 1.6], [0, offset * 2, 1.6], [-offset, offset, 1.6], [-0.95, 0.2, 1.1], [0.95, 0.2, 1.1], [0, -1.3, 1.2], [0, BbFieldGeometry.RUBBER_DISTANCE - 1.3, 1.1], [0, BbFieldGeometry.RUBBER_DISTANCE - 0.3, 0.9]];
        worn.forEach(([x, z, radius]) => {
            const glow = context.createRadialGradient(surface.x(x), surface.y(z), 0, surface.x(x), surface.y(z), surface.size(radius));
            glow.addColorStop(0, BbGroundPainter.DIRT_WORN);
            glow.addColorStop(1, "rgba(199,154,108,0)");
            context.fillStyle = glow;
            surface.disc(x, z, radius);
            context.fill();
        });
        context.save();
        context.globalAlpha = 0.1;
        context.strokeStyle = "#6e4a2a";
        context.lineWidth = Math.max(1, surface.size(0.05));
        surface.trace([[0, -4], [-40, 34], [-40, 60], [40, 60], [40, 34]], true);
        context.clip();
        for (let radius = BbFieldGeometry.INFIELD_DIRT_RADIUS - 0.4; radius > 19; radius -= 0.42) {
            surface.disc(0, BbFieldGeometry.RUBBER_DISTANCE, radius);
            context.stroke();
        }
        context.restore();
    }
    speckle(surface, fineDetail) {
        const context = surface.context, random = new BbScatter(4141), count = fineDetail ? 26000 : 60000;
        for (let index = 0; index < count; index++) {
            const x = random.next() * surface.pixels, y = random.next() * surface.pixels, size = random.between(1, fineDetail ? 3.4 : 2.2);
            context.fillStyle = random.next() < 0.5 ? "rgba(255,255,220,0.045)" : "rgba(20,40,10,0.05)";
            context.fillRect(x, y, size, size);
        }
    }
    paintWallShade(surface) {
        const context = surface.context;
        context.save();
        context.strokeStyle = "rgba(0,0,0,0.22)";
        context.lineWidth = surface.size(2.4);
        context.filter = "blur(" + Math.max(1, surface.size(0.6)) + "px)";
        surface.trace(this.outline.loop, true);
        context.stroke();
        context.filter = "blur(" + Math.max(1, surface.size(0.35)) + "px)";
        context.fillStyle = "rgba(0,0,0,0.18)";
        surface.disc(0.25, BbFieldGeometry.RUBBER_DISTANCE - 0.25, BbFieldGeometry.MOUND_RADIUS * 0.96);
        context.fill();
        context.restore();
    }
    paintChalk(surface) {
        const context = surface.context, line = Math.max(1.5, surface.size(0.075));
        context.strokeStyle = BbGroundPainter.CHALK;
        context.lineWidth = line;
        context.lineJoin = "miter";
        const boxInner = BbFieldGeometry.PLATE_WIDTH / 2 + 0.15, boxWidth = 1.22, boxFront = 0.215 + 0.915, boxBack = 0.215 - 0.915;
        [1, -1].forEach((side) => {
            surface.trace([[side * boxInner, boxBack], [side * (boxInner + boxWidth), boxBack], [side * (boxInner + boxWidth), boxFront], [side * boxInner, boxFront]], true);
            context.stroke();
            surface.disc(side * 11.3, -3.6, 0.76);
            context.stroke();
            surface.trace([[side * 0.55, boxBack], [side * 0.55, -2.44]], false);
            context.stroke();
        });
        surface.trace([[-0.55, -2.44], [0.55, -2.44]], false);
        context.stroke();
        const half = BbFieldGeometry.BASE_OFFSET / 2, lane = 0.91 * Math.SQRT1_2;
        surface.trace([[half + lane, half - lane], [BbFieldGeometry.BASE_OFFSET + lane, BbFieldGeometry.BASE_OFFSET - lane]], false);
        context.stroke();
    }
}
BbGroundPainter.GRASS = "#4c9140";
BbGroundPainter.MOW_SHEEN = "rgba(170,225,120,0.15)";
BbGroundPainter.GRASS_LIP = "rgba(38,78,30,0.38)";
BbGroundPainter.LIP_WIDTH = 0.24;
BbGroundPainter.MOW_REACH = 230;
BbGroundPainter.DIRT = "#b98656";
BbGroundPainter.DIRT_WORN = "#c79a6c";
BbGroundPainter.TRACK = "#a8744a";
BbGroundPainter.APRON = "#6f7377";
BbGroundPainter.CHALK = "#f7f6f0";
BbGroundPainter.STRIPE_WIDTH = 5.6;
BbGroundPainter.PATH_INSET = 1.25;
BbGroundPainter.BASE_CUTOUT = 3.3;
class BbBallparkBuilder {
    constructor(libs, spec) {
        this.libs = libs;
        this.spec = spec;
        this.crowdSeats = [];
        this.random = new BbScatter(20261112);
        this.group = new libs.THREE.Group();
        this.outline = new BbParkOutline(spec.dimensions);
    }
    build() {
        this.addGround();
        this.addMound();
        this.addBasesAndPlate();
        this.addChalkLines();
        this.addWalls();
        this.addBackstop();
        this.addFoulPoles();
        this.addStands();
        this.addDugouts();
        this.addScoreboard();
        this.addLightTowers();
        this.addSky();
        this.addSurroundings();
        return this.group;
    }
    textureOf(canvas, repeat) {
        const THREE = this.libs.THREE, texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        if (repeat)
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }
    addGround() {
        const THREE = this.libs.THREE, painter = new BbGroundPainter(this.outline);
        const apron = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: "#59635a" }));
        apron.rotation.x = -Math.PI / 2;
        apron.position.y = -0.06;
        this.group.add(apron);
        const layers = [[2048, 52, 300, false], [2048, 19.4, 74, true], [1024, 1.4, 15, true]];
        layers.forEach(([pixels, centerZ, span, fine], index) => {
            const surface = new BbFieldCanvas(pixels, 0, centerZ, span);
            painter.paint(surface, fine);
            const material = new THREE.MeshLambertMaterial({ map: this.textureOf(surface.canvas, false), polygonOffset: true, polygonOffsetFactor: -index, polygonOffsetUnits: -index * 2 });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(span, span), material);
            plane.rotation.x = -Math.PI / 2;
            plane.position.set(0, index * 0.004, -centerZ);
            plane.receiveShadow = true;
            plane.renderOrder = index - 5;
            this.group.add(plane);
        });
    }
    dirtTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const context = canvas.getContext("2d"), random = new BbScatter(77);
        context.fillStyle = "#bd8b5b";
        context.fillRect(0, 0, 256, 256);
        for (let index = 0; index < 5000; index++) {
            context.fillStyle = random.next() < 0.5 ? "rgba(255,235,200,0.07)" : "rgba(70,40,15,0.08)";
            context.fillRect(random.next() * 256, random.next() * 256, random.between(1, 3), random.between(1, 3));
        }
        return this.textureOf(canvas, true);
    }
    addMound() {
        const THREE = this.libs.THREE, height = BbFieldGeometry.MOUND_HEIGHT, radius = BbFieldGeometry.MOUND_RADIUS;
        const profile = [[0, height], [0.75, height], [1.3, height * 0.86], [2, height * 0.42], [radius, 0.004]].map(([r, y]) => new THREE.Vector2(r, y));
        const texture = this.dirtTexture();
        texture.repeat.set(6, 2);
        const mound = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), new THREE.MeshLambertMaterial({ map: texture }));
        mound.position.set(0, 0, -BbFieldGeometry.RUBBER_DISTANCE);
        mound.receiveShadow = true;
        const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.04, 0.15), new THREE.MeshLambertMaterial({ color: "#f4f2ea" }));
        rubber.position.set(0, height + 0.012, -BbFieldGeometry.RUBBER_DISTANCE - BbFieldGeometry.RUBBER_BEHIND_FEET);
        rubber.receiveShadow = true;
        this.group.add(mound, rubber);
    }
    addBasesAndPlate() {
        const THREE = this.libs.THREE, white = new THREE.MeshLambertMaterial({ color: "#f7f5ee" }), size = BbFieldGeometry.BASE_SIZE;
        [BbFieldGeometry.FIRST, BbFieldGeometry.SECOND, BbFieldGeometry.THIRD].forEach((spot) => {
            const base = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), white);
            base.position.set(spot.x, 0.045, spot.z);
            base.rotation.y = Math.PI / 4;
            base.castShadow = base.receiveShadow = true;
            this.group.add(base);
        });
        const half = BbFieldGeometry.PLATE_WIDTH / 2, rim = BbBallparkBuilder.PLATE_RIM;
        const pentagon = (grow) => {
            const shape = new THREE.Shape(), side = half + grow, slant = grow * Math.SQRT2;
            shape.moveTo(-side, half * 2 + grow);
            shape.lineTo(side, half * 2 + grow);
            shape.lineTo(side, half - grow * (Math.SQRT2 - 1));
            shape.lineTo(0, -slant);
            shape.lineTo(-side, half - grow * (Math.SQRT2 - 1));
            shape.closePath();
            return shape;
        };
        [[pentagon(rim), white, 0.022, 0.012]].forEach(([shape, material, depth, height]) => {
            const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), material);
            plate.rotation.x = -Math.PI / 2;
            plate.position.y = height;
            plate.receiveShadow = true;
            this.group.add(plate);
        });
    }
    addChalkLines() {
        const THREE = this.libs.THREE, chalk = new THREE.MeshBasicMaterial({ color: "#f3f2ea", polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
        const start = BbBallparkBuilder.FOUL_LINE_START, length = this.spec.dimensions.fenceDistance(BbFieldGeometry.FOUL_LINE_DEGREES) - start;
        [1, -1].forEach((side) => {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, length), chalk);
            line.rotation.set(-Math.PI / 2, 0, -side * Math.PI / 4);
            const middle = BbParkOutline.polar(start + length / 2, side * 45);
            line.position.set(middle[0], 0.02, -middle[1]);
            line.renderOrder = 1;
            this.group.add(line);
        });
    }
    wallTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 2048;
        canvas.height = 128;
        const context = canvas.getContext("2d"), panels = BbBallparkBuilder.WALL_PANELS, panelWidth = canvas.width / panels;
        for (let panel = 0; panel < panels; panel++) {
            const left = panel * panelWidth, shade = context.createLinearGradient(0, 0, 0, 128);
            shade.addColorStop(0, panel % 2 ? "#1f6a45" : "#1b5f3e");
            shade.addColorStop(1, panel % 2 ? "#17523a" : "#144a33");
            context.fillStyle = shade;
            context.fillRect(left, 0, panelWidth, 128);
            context.fillStyle = "rgba(0,0,0,0.25)";
            context.fillRect(left, 0, 3, 128);
            context.fillStyle = "rgba(255,255,255,0.08)";
            context.fillRect(left + 3, 0, 2, 128);
        }
        context.fillStyle = "#f2c230";
        context.fillRect(0, 0, canvas.width, 9);
        context.fillStyle = "rgba(0,0,0,0.35)";
        context.fillRect(0, 118, canvas.width, 10);
        return this.textureOf(canvas, true);
    }
    stripGeometry(points, bottom, top, metersPerRepeat) {
        const THREE = this.libs.THREE, positions = [], uvs = [], indices = [];
        let travelled = 0;
        points.forEach(([x, z], index) => {
            if (index)
                travelled += Math.hypot(x - points[index - 1][0], z - points[index - 1][1]);
            positions.push(x, bottom, -z, x, top, -z);
            uvs.push(travelled / metersPerRepeat, 0, travelled / metersPerRepeat, 1);
            if (index) {
                const base = index * 2;
                indices.push(base - 2, base, base - 1, base, base + 1, base - 1);
            }
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }
    addWalls() {
        const THREE = this.libs.THREE, outline = this.outline, height = this.spec.dimensions.wallHeight;
        const fence = new THREE.Mesh(this.stripGeometry(outline.fence, 0, height, 96), new THREE.MeshLambertMaterial({ map: this.wallTexture(), side: THREE.DoubleSide }));
        fence.receiveShadow = true;
        this.group.add(fence);
        const sidePoints = [...outline.rightSide, ...outline.back, ...outline.leftSide];
        const padding = new THREE.MeshLambertMaterial({ color: "#1c5a3c", side: THREE.DoubleSide });
        this.group.add(new THREE.Mesh(this.stripGeometry(sidePoints, 0, BbParkOutline.SIDE_WALL_HEIGHT, 10), padding));
        const cap = new THREE.Mesh(this.stripGeometry(sidePoints, BbParkOutline.SIDE_WALL_HEIGHT, BbParkOutline.SIDE_WALL_HEIGHT + 0.08, 10), new THREE.MeshLambertMaterial({ color: "#f2c230", side: THREE.DoubleSide }));
        this.group.add(cap);
        [[-41, "100"], [-22.5, "110"], [0, "120"], [22.5, "110"], [41, "100"]].forEach(([degrees, label]) => {
            const canvas = document.createElement("canvas");
            canvas.width = 128;
            canvas.height = 64;
            const context = canvas.getContext("2d");
            context.fillStyle = "#f6f1dc";
            context.font = '800 54px "Nanum Gothic", "Malgun Gothic", sans-serif';
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(label, 64, 34);
            const angle = degrees, spot = BbParkOutline.polar(this.spec.dimensions.fenceDistance(angle) - 0.35, angle);
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: this.textureOf(canvas, false), transparent: true, depthWrite: false }));
            sign.position.set(spot[0], 1.75, -spot[1]);
            sign.lookAt(0, 1.75, 0);
            sign.renderOrder = 3;
            this.group.add(sign);
        });
    }
    addBackstop() {
        const THREE = this.libs.THREE, canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d");
        context.strokeStyle = "rgba(235,240,235,0.55)";
        context.lineWidth = 2;
        context.strokeRect(0, 0, 64, 64);
        const net = this.textureOf(canvas, true);
        net.repeat.set(1, 28);
        const material = new THREE.MeshBasicMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false });
        material.forceSinglePass = true;
        const points = [this.outline.rightSide[2], ...this.outline.back, this.outline.leftSide[0]];
        this.group.add(new THREE.Mesh(this.stripGeometry(points, BbParkOutline.SIDE_WALL_HEIGHT, 9, 0.3), material));
        const post = new THREE.CylinderGeometry(0.09, 0.09, 9, 8), steel = new THREE.MeshLambertMaterial({ color: "#3d4a45" });
        points.forEach(([x, z], index) => {
            if (index % 2)
                return;
            const mesh = new THREE.Mesh(post, steel);
            mesh.position.set(x, 4.5, -z);
            this.group.add(mesh);
        });
    }
    addFoulPoles() {
        const THREE = this.libs.THREE, yellow = new THREE.MeshBasicMaterial({ color: "#f2c230" });
        [-45, 45].forEach((degrees) => {
            const spot = BbParkOutline.polar(this.spec.dimensions.fenceDistance(degrees) + 0.1, degrees);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 15, 10), yellow);
            pole.position.set(spot[0], 7.5, -spot[1]);
            const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 9), new THREE.MeshBasicMaterial({ color: "#f2c230", transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
            const inward = BbParkOutline.polar(this.spec.dimensions.fenceDistance(degrees) + 0.1, degrees * 0.99);
            wing.position.set((spot[0] + inward[0]) / 2 + Math.sign(-degrees) * 0.4, 10.5, -(spot[1] + inward[1]) / 2);
            wing.lookAt(0, 10.5, 0);
            this.group.add(pole, wing);
        });
    }
    tiersAt(index) {
        const fenceCount = this.outline.fence.length;
        if (index < fenceCount)
            return 8 + Math.round(3 * Math.sin(index / (fenceCount - 1) * Math.PI));
        return 15;
    }
    addStands() {
        const THREE = this.libs.THREE, outline = this.outline, loop = outline.loop, count = loop.length;
        const positions = [], colors = [], indices = [], color = new THREE.Color();
        const bodies = [], depth = BbBallparkBuilder.TIER_DEPTH, rise = BbBallparkBuilder.TIER_RISE;
        const cornerAt = (index, tier) => {
            const wrapped = (index + count) % count, point = loop[wrapped], normal = outline.outward(wrapped);
            const out = 0.6 + tier * depth, base = outline.wallHeightAt(wrapped) + 0.5;
            return [point[0] + normal[0] * out, base + (tier - 1) * rise, point[1] + normal[1] * out];
        };
        const quad = (a, b, c, d, hex, shade) => {
            const base = positions.length / 3;
            [a, b, c, d].forEach((corner) => {
                positions.push(corner[0], corner[1], -corner[2]);
                color.set(hex).multiplyScalar(shade);
                colors.push(color.r, color.g, color.b);
            });
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        };
        for (let index = 0; index < count; index++) {
            const next = index + 1, tiers = Math.min(this.tiersAt(index), this.tiersAt(next % count));
            const aisle = index % 9 === 4;
            for (let tier = 0; tier < tiers; tier++) {
                const lowA = cornerAt(index, tier), lowB = cornerAt(next, tier), highA = cornerAt(index, tier + 1), highB = cornerAt(next, tier + 1);
                const seat = aisle ? "#8b8f94" : BbBallparkBuilder.SEAT_COLORS[(tier + Math.floor(index / 9)) % 3];
                quad([lowA[0], lowA[1], lowA[2]], [lowB[0], lowB[1], lowB[2]], [lowB[0], highB[1], lowB[2]], [lowA[0], highA[1], lowA[2]], "#7d8288", 0.72);
                quad([lowA[0], highA[1], lowA[2]], [lowB[0], highB[1], lowB[2]], [highB[0], highB[1], highB[2]], [highA[0], highA[1], highA[2]], seat, 0.8 + tier * 0.012);
                if (aisle)
                    continue;
                const width = Math.hypot(lowB[0] - lowA[0], lowB[2] - lowA[2]), seats = Math.floor(width / 0.72);
                for (let seatIndex = 0; seatIndex < seats; seatIndex++) {
                    if (this.random.next() > 0.6)
                        continue;
                    const along = (seatIndex + 0.5) / seats, inward = 0.55;
                    bodies.push(BbCurve.mix(BbCurve.mix(lowA[0], lowB[0], along), BbCurve.mix(highA[0], highB[0], along), inward), BbCurve.mix(highA[1], highB[1], along), BbCurve.mix(BbCurve.mix(lowA[2], lowB[2], along), BbCurve.mix(highA[2], highB[2], along), inward));
                }
            }
            const top = cornerAt(index, tiers), topNext = cornerAt(next, tiers);
            quad([top[0], top[1], top[2]], [topNext[0], topNext[1], topNext[2]], [topNext[0], topNext[1] + 3.2, topNext[2]], [top[0], top[1] + 3.2, top[2]], "#5d6670", 0.9);
            const foot = cornerAt(index, 0), footNext = cornerAt(next, 0);
            quad([loop[index][0], 0, loop[index][1]], [loop[next % count][0], 0, loop[next % count][1]], [footNext[0], footNext[1], footNext[2]], [foot[0], foot[1], foot[2]], "#4b5258", 0.8);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        this.group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
        this.addCrowd(bodies);
    }
    addCrowd(seats) { this.crowdSeats = seats.slice(); }
    addDugouts() {
        const THREE = this.libs.THREE, width = this.spec.dimensions.foulTerritoryWidth;
        const concrete = new THREE.MeshLambertMaterial({ color: "#3b4148" }), wood = new THREE.MeshLambertMaterial({ color: "#9a6a3c" });
        [[1, BbTeamKits.HOME], [-1, BbTeamKits.AWAY]].forEach(([sideValue, kitValue]) => {
            const side = sideValue, kit = kitValue, dugout = new THREE.Group();
            const roof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.22, 3.4), new THREE.MeshLambertMaterial({ color: kit.cap }));
            roof.position.set(0, 2.5, 0);
            const back = new THREE.Mesh(new THREE.BoxGeometry(13, 2.5, 0.2), concrete);
            back.position.set(0, 1.25, 1.6);
            const floor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.1, 3.4), concrete);
            floor.position.y = 0.03;
            const bench = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.1, 0.5), wood);
            bench.position.set(0, 0.55, 1.1);
            const rail = new THREE.Mesh(new THREE.BoxGeometry(13, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: "#d8d8d8" }));
            rail.position.set(0, 1.05, -1.65);
            dugout.add(roof, back, floor, bench, rail);
            for (let post = -6; post <= 6; post += 3) {
                const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.5, 0.14), concrete);
                pillar.position.set(post, 1.25, -1.6);
                dugout.add(pillar);
                const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: kit.cap }));
                helmet.position.set(post + 1.4, 1.75, 1.45);
                dugout.add(helmet);
            }
            const cooler = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 12), new THREE.MeshLambertMaterial({ color: "#f08a3e" }));
            cooler.position.set(5.6, 0.95, 1.05);
            dugout.add(cooler);
            const along = 15, out = width + 1.9, diagonal = Math.SQRT1_2;
            dugout.position.set(side * (along * diagonal + out * diagonal), 0, -(along * diagonal - out * diagonal));
            dugout.rotation.y = side * Math.PI / 4 + (side > 0 ? Math.PI : 0) + Math.PI;
            dugout.traverse((node) => { node.castShadow = false; });
            this.group.add(dugout);
        });
    }
    addScoreboard() {
        const THREE = this.libs.THREE, canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 384;
        const context = canvas.getContext("2d"), font = '"Nanum Gothic", "Malgun Gothic", sans-serif';
        context.fillStyle = "#0d1413";
        context.fillRect(0, 0, 1024, 384);
        context.textBaseline = "middle";
        context.textAlign = "center";
        context.fillStyle = "#f2c230";
        context.font = "800 40px " + font;
        context.fillText("동마 구장", 512, 38);
        const nameLeft = 36, inningLeft = 226, inningWidth = 56, totalLeft = 752, totalWidth = 78, top = 76, rowHeight = 68;
        context.strokeStyle = "#2c4039";
        context.lineWidth = 2;
        for (let row = 0; row <= 3; row++) {
            context.beginPath();
            context.moveTo(nameLeft, top + row * rowHeight);
            context.lineTo(totalLeft + totalWidth * 3, top + row * rowHeight);
            context.stroke();
        }
        const columnEdges = [nameLeft];
        for (let inning = 0; inning <= 9; inning++)
            columnEdges.push(inningLeft + inning * inningWidth);
        for (let total = 0; total <= 3; total++)
            columnEdges.push(totalLeft + total * totalWidth);
        columnEdges.forEach((x) => { context.beginPath(); context.moveTo(x, top); context.lineTo(x, top + rowHeight * 3); context.stroke(); });
        context.fillStyle = "#cfd8d4";
        context.font = "700 34px " + font;
        for (let inning = 1; inning <= 9; inning++)
            context.fillText(String(inning), inningLeft + (inning - 0.5) * inningWidth, top + rowHeight / 2);
        ["R", "H", "E"].forEach((label, index) => context.fillText(label, totalLeft + (index + 0.5) * totalWidth, top + rowHeight / 2));
        ["원정", "홈"].forEach((team, row) => {
            const middle = top + rowHeight * (row + 1.5);
            context.fillStyle = "#ffffff";
            context.font = "800 38px " + font;
            context.fillText(team, (nameLeft + inningLeft) / 2, middle);
            context.fillStyle = "#ffd75e";
            context.font = "800 42px " + font;
            for (let total = 0; total < 3; total++)
                context.fillText("0", totalLeft + (total + 0.5) * totalWidth, middle);
        });
        const lampTop = 332;
        [["B", 3, "#3fbf5a"], ["S", 2, "#f2c230"], ["O", 2, "#e2513f"]].forEach(([label, count, color], group) => {
            const left = 250 + group * 200;
            context.fillStyle = "#cfd8d4";
            context.font = "800 36px " + font;
            context.fillText(label, left, lampTop);
            for (let lamp = 0; lamp < count; lamp++) {
                context.beginPath();
                context.arc(left + 44 + lamp * 40, lampTop, 14, 0, Math.PI * 2);
                context.fillStyle = "#1d2a27";
                context.fill();
                context.strokeStyle = color;
                context.lineWidth = 3;
                context.stroke();
            }
        });
        const spot = BbParkOutline.polar(this.spec.dimensions.fenceDistance(0) + 24, 0);
        const board = new THREE.Mesh(new THREE.BoxGeometry(34, 12.75, 1.2), [new THREE.MeshLambertMaterial({ color: "#1b2422" }), new THREE.MeshLambertMaterial({ color: "#1b2422" }), new THREE.MeshLambertMaterial({ color: "#1b2422" }), new THREE.MeshLambertMaterial({ color: "#1b2422" }), new THREE.MeshBasicMaterial({ map: this.textureOf(canvas, false) }), new THREE.MeshLambertMaterial({ color: "#1b2422" })]);
        board.position.set(spot[0], 22, -spot[1]);
        this.group.add(board);
        [-12, 12].forEach((shift) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(1, 16, 1), new THREE.MeshLambertMaterial({ color: "#39423f" }));
            leg.position.set(shift, 8, -spot[1] - 0.4);
            this.group.add(leg);
        });
    }
    addLightTowers() {
        const THREE = this.libs.THREE, steel = new THREE.MeshLambertMaterial({ color: "#59616a" }), lamp = new THREE.MeshBasicMaterial({ color: "#fff6d8" });
        [[-28, 152], [28, 152], [-108, 78], [108, 78]].forEach(([degrees, distance]) => {
            const spot = BbParkOutline.polar(distance, degrees);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 40, 8), steel);
            pole.position.set(spot[0], 20, -spot[1]);
            const bank = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.8), steel);
            bank.position.set(spot[0], 43.4, -spot[1]);
            bank.lookAt(0, 10, -40);
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 4.2), lamp);
            glow.position.copy(bank.position);
            glow.lookAt(0, 10, -40);
            glow.translateZ(0.45);
            this.group.add(pole, bank, glow);
        });
    }
    addSky() {
        const THREE = this.libs.THREE, canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 256;
        const context = canvas.getContext("2d"), gradient = context.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, "#2f6fc4");
        gradient.addColorStop(0.42, "#78aee6");
        gradient.addColorStop(0.5, "#cfe4f4");
        gradient.addColorStop(1, "#cfe4f4");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 8, 256);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 16), new THREE.MeshBasicMaterial({ map: this.textureOf(canvas, false), side: THREE.BackSide, fog: false, depthWrite: false }));
        dome.renderOrder = -10;
        this.group.add(dome);
        const puff = document.createElement("canvas");
        puff.width = 256;
        puff.height = 128;
        const puffContext = puff.getContext("2d");
        for (let blob = 0; blob < 9; blob++) {
            const x = this.random.between(50, 206), y = this.random.between(50, 84), radius = this.random.between(26, 46);
            const soft = puffContext.createRadialGradient(x, y, 0, x, y, radius);
            soft.addColorStop(0, "rgba(255,255,255,0.9)");
            soft.addColorStop(1, "rgba(255,255,255,0)");
            puffContext.fillStyle = soft;
            puffContext.fillRect(0, 0, 256, 128);
        }
        const cloudMaterial = new THREE.MeshBasicMaterial({ map: this.textureOf(puff, false), transparent: true, depthWrite: false, fog: false });
        for (let cloud = 0; cloud < 16; cloud++) {
            const angle = this.random.between(0, Math.PI * 2), distance = this.random.between(520, 900), size = this.random.between(180, 330);
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.45), cloudMaterial);
            mesh.position.set(Math.sin(angle) * distance, this.random.between(150, 330), Math.cos(angle) * distance);
            mesh.lookAt(0, 20, -40);
            mesh.renderOrder = -9;
            this.group.add(mesh);
        }
    }
    addSurroundings() {
        const THREE = this.libs.THREE, matrix = new THREE.Matrix4(), color = new THREE.Color(), scale = new THREE.Vector3(), position = new THREE.Vector3(), turn = new THREE.Quaternion();
        const treeCount = 420, towerCount = 110;
        const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(3.4, 9, 7), new THREE.MeshLambertMaterial(), treeCount);
        const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), towerCount);
        for (let index = 0; index < treeCount; index++) {
            const angle = this.random.between(0, Math.PI * 2), distance = this.random.between(205, 330), size = this.random.between(0.8, 1.9);
            position.set(Math.sin(angle) * distance, 4.5 * size, -55 + Math.cos(angle) * distance);
            matrix.compose(position, turn, scale.set(size, size, size));
            leaves.setMatrixAt(index, matrix);
            leaves.setColorAt(index, color.set(this.random.pick(["#2f6b3a", "#3a7a42", "#2a5f35", "#4a8a48"])));
        }
        for (let index = 0; index < towerCount; index++) {
            const angle = this.random.between(0, Math.PI * 2), distance = this.random.between(340, 620), height = this.random.between(22, 95);
            position.set(Math.sin(angle) * distance, height / 2, -55 + Math.cos(angle) * distance);
            matrix.compose(position, turn, scale.set(this.random.between(18, 40), height, this.random.between(18, 40)));
            towers.setMatrixAt(index, matrix);
            towers.setColorAt(index, color.set(this.random.pick(["#aab4c2", "#9aa7b8", "#c4c9cf", "#8f9db0", "#b9c2c9"])));
        }
        leaves.frustumCulled = towers.frustumCulled = false;
        this.group.add(leaves, towers);
    }
}
BbBallparkBuilder.SEAT_COLORS = ["#2d5fa8", "#2a579b", "#31649f"];
BbBallparkBuilder.WALL_PANELS = 16;
BbBallparkBuilder.FOUL_LINE_START = 1.72;
BbBallparkBuilder.PLATE_RIM = 0;
BbBallparkBuilder.TIER_DEPTH = 1.5;
BbBallparkBuilder.TIER_RISE = 0.85;
class BbParkLighting {
    constructor(libs) {
        const THREE = libs.THREE;
        this.sky = new THREE.HemisphereLight("#eaf3ff", "#6f8a5c", 1.55);
        this.sun = new THREE.DirectionalLight("#fff1d6", 2.3);
        this.sun.position.set(-34, 60, 22);
        this.sun.target.position.set(0, 0, -9);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        const frustum = this.sun.shadow.camera;
        frustum.left = -17;
        frustum.right = 17;
        frustum.top = 17;
        frustum.bottom = -17;
        frustum.near = 10;
        frustum.far = 140;
        this.sun.shadow.bias = -0.0006;
        this.sun.shadow.normalBias = 0.02;
    }
    addTo(scene) { scene.add(this.sky, this.sun, this.sun.target); }
}
