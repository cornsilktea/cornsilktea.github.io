"use strict";
class FrFxTextures {
    static radial(libs, inner, outer, size = 64) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const g = canvas.getContext("2d");
        const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, inner);
        gradient.addColorStop(1, outer);
        g.fillStyle = gradient;
        g.fillRect(0, 0, size, size);
        return new libs.THREE.CanvasTexture(canvas);
    }
    static flame(libs) {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 128;
        const g = canvas.getContext("2d");
        const gradient = g.createRadialGradient(32, 92, 2, 32, 84, 58);
        gradient.addColorStop(0, "rgba(255,250,200,1)");
        gradient.addColorStop(0.35, "rgba(255,170,40,0.95)");
        gradient.addColorStop(0.75, "rgba(230,70,20,0.45)");
        gradient.addColorStop(1, "rgba(200,30,10,0)");
        g.fillStyle = gradient;
        g.beginPath();
        g.moveTo(32, 2);
        g.bezierCurveTo(58, 50, 62, 90, 32, 124);
        g.bezierCurveTo(2, 90, 6, 50, 32, 2);
        g.fill();
        return new libs.THREE.CanvasTexture(canvas);
    }
}
class FrCampfireFx {
    constructor(libs, parent) {
        this.libs = libs;
        this.flames = [];
        this.smoke = [];
        this.emberState = [];
        const T = libs.THREE;
        this.group = new T.Group();
        parent.add(this.group);
        const logMaterial = new T.MeshLambertMaterial({ color: 0x5e3b1c });
        for (let i = 0; i < 5; i++) {
            const log = new T.Mesh(new T.CylinderGeometry(0.16, 0.18, 1.7, 7), logMaterial);
            log.rotation.z = Math.PI / 2 - 0.25;
            log.rotation.y = (i * Math.PI * 2) / 5;
            log.position.set(Math.cos((i * Math.PI * 2) / 5) * 0.35, 0.22, Math.sin((i * Math.PI * 2) / 5) * 0.35);
            this.group.add(log);
        }
        const stoneMaterial = new T.MeshLambertMaterial({ color: 0x8b8e96 });
        for (let i = 0; i < 9; i++) {
            const angle = (i * Math.PI * 2) / 9;
            const stone = new T.Mesh(new T.DodecahedronGeometry(0.3 + (i % 3) * 0.06, 0), stoneMaterial);
            stone.position.set(Math.cos(angle) * 1.5, 0.15, Math.sin(angle) * 1.5);
            stone.rotation.set(i, i * 2, 0);
            this.group.add(stone);
        }
        const flameTexture = FrFxTextures.flame(libs);
        [[0, 1.5, 3.2, 0xffffff], [0.35, 1.2, 2.6, 0xffc060], [-0.35, 1.25, 2.7, 0xffb050], [0.1, 0.9, 1.9, 0xfff0a0], [-0.12, 1.0, 2.1, 0xff8a30], [0.25, 0.7, 1.5, 0xffe080]].forEach(([x, w, h, color], i) => {
            const sprite = new T.Sprite(new T.SpriteMaterial({ map: flameTexture, color, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
            const big = 1.55;
            sprite.position.set(x * big, h * big * 0.5 + 0.2, (i % 2) * 0.12);
            sprite.scale.set(w * big, h * big, 1);
            this.group.add(sprite);
            this.flames.push({ sprite, phase: i * 1.3, height: h * big, sway: (0.1 + (i % 3) * 0.05) * big });
        });
        const emberGeometry = new T.BufferGeometry();
        emberGeometry.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(FrCampfireFx.EMBERS * 3), 3));
        emberGeometry.setAttribute("color", new T.Float32BufferAttribute(new Float32Array(FrCampfireFx.EMBERS * 3), 3));
        this.emberPoints = new T.Points(emberGeometry, new T.PointsMaterial({ size: 0.6, map: FrFxTextures.radial(libs, "rgba(255,240,170,1)", "rgba(255,120,20,0)"), blending: T.AdditiveBlending, depthWrite: false, transparent: true, vertexColors: true }));
        this.emberPoints.frustumCulled = false;
        this.group.add(this.emberPoints);
        for (let i = 0; i < FrCampfireFx.EMBERS; i++)
            this.emberState.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: Math.random() * 2, life: 0 });
        const smokeTexture = FrFxTextures.radial(libs, "rgba(150,150,150,0.55)", "rgba(150,150,150,0)");
        for (let i = 0; i < FrCampfireFx.SMOKE; i++) {
            const sprite = new T.Sprite(new T.SpriteMaterial({ map: smokeTexture, transparent: true, depthWrite: false, opacity: 0.0 }));
            this.group.add(sprite);
            this.smoke.push({ sprite, age: (i / FrCampfireFx.SMOKE) * 4, life: 4 });
        }
        this.glowDisc = new T.Mesh(new T.CircleGeometry(7, 32), new T.MeshBasicMaterial({ map: FrFxTextures.radial(libs, "rgba(255,170,70,0.9)", "rgba(255,120,30,0)", 128), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4 }));
        this.glowDisc.rotation.x = -Math.PI / 2;
        this.glowDisc.position.y = 0.08;
        this.group.add(this.glowDisc);
        this.halo = new T.Sprite(new T.SpriteMaterial({ map: FrFxTextures.radial(libs, "rgba(255,190,90,0.8)", "rgba(255,150,40,0)", 128), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3 }));
        this.halo.position.y = 1.8;
        this.halo.scale.set(9, 9, 1);
        this.group.add(this.halo);
    }
    update(dt, time, night) {
        this.flames.forEach((f, i) => {
            const wobble = 0.88 + 0.22 * Math.sin(time * (8 + i) + f.phase) + 0.1 * Math.sin(time * 17 + f.phase * 2);
            f.sprite.scale.y = f.height * wobble;
            f.sprite.scale.x = f.sprite.scale.x * 0.9 + (f.height * 0.45 * (1.05 - 0.15 * wobble)) * 0.1;
            f.sprite.position.y = f.sprite.scale.y * 0.5 + 0.15;
            f.sprite.position.x = Math.sin(time * 3 + f.phase) * f.sway;
        });
        this.updateEmbers(dt);
        this.smoke.forEach((s) => {
            s.age += dt;
            if (s.age > s.life)
                s.age = 0;
            const t = s.age / s.life;
            s.sprite.position.set(Math.sin(t * 5 + s.life) * 0.7 + t * 0.8, 2.6 + t * 6.5, 0);
            const size = 2 + t * 4.5;
            s.sprite.scale.set(size, size, 1);
            s.sprite.material.opacity = Math.sin(Math.PI * t) * (0.16 + 0.12 * night);
        });
        const flicker = 0.92 + 0.08 * Math.sin(time * 13) + 0.05 * Math.sin(time * 5.1);
        this.glowDisc.material.opacity = (0.22 + 0.62 * night) * flicker;
        this.halo.material.opacity = (0.16 + 0.34 * night) * flicker;
    }
    updateEmbers(dt) {
        const positions = this.emberPoints.geometry.getAttribute("position");
        const colors = this.emberPoints.geometry.getAttribute("color");
        this.emberState.forEach((e, i) => {
            e.age += dt;
            if (e.age >= e.life) {
                const angle = Math.random() * Math.PI * 2, radius = Math.random() * 0.5;
                e.x = Math.cos(angle) * radius;
                e.y = 0.8 + Math.random() * 0.6;
                e.z = Math.sin(angle) * radius;
                e.vx = (Math.random() - 0.5) * 0.9;
                e.vy = 1.6 + Math.random() * 2.2;
                e.vz = (Math.random() - 0.5) * 0.9;
                e.age = 0;
                e.life = 0.9 + Math.random() * 1.6;
            }
            e.x += e.vx * dt + Math.sin(e.age * 6 + i) * 0.01;
            e.y += e.vy * dt;
            e.z += e.vz * dt;
            const fade = Math.max(0, 1 - e.age / e.life);
            positions.setXYZ(i, e.x, e.y, e.z);
            colors.setXYZ(i, fade, fade * (0.55 + 0.3 * fade), fade * 0.12);
        });
        positions.needsUpdate = true;
        colors.needsUpdate = true;
    }
}
FrCampfireFx.EMBERS = 44;
FrCampfireFx.SMOKE = 5;
class FrBurst {
    constructor(libs, scene) {
        this.libs = libs;
        this.particles = [];
        this.cursor = 0;
        const T = libs.THREE;
        this.mesh = new T.InstancedMesh(new T.BoxGeometry(0.34, 0.34, 0.34), new T.MeshBasicMaterial({ color: 0xffffff }), FrBurst.CAPACITY);
        this.mesh.frustumCulled = false;
        this.matrix = new T.Matrix4();
        this.color = new T.Color();
        for (let i = 0; i < FrBurst.CAPACITY; i++) {
            this.particles.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 1, size: 0 });
            this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
            this.mesh.setColorAt(i, this.color.set(0xffffff));
        }
        scene.add(this.mesh);
    }
    emit(x, y, z, colors, count, speed, up = 1) {
        for (let n = 0; n < count; n++) {
            const p = this.particles[this.cursor];
            const angle = Math.random() * Math.PI * 2, lift = 0.4 + Math.random() * 0.9;
            p.x = x;
            p.y = y;
            p.z = z;
            p.vx = Math.cos(angle) * speed * (0.4 + Math.random() * 0.8);
            p.vz = Math.sin(angle) * speed * (0.4 + Math.random() * 0.8);
            p.vy = speed * lift * up;
            p.age = 0;
            p.life = 0.5 + Math.random() * 0.5;
            p.size = 0.7 + Math.random() * 0.9;
            this.mesh.setColorAt(this.cursor, this.color.set(colors[Math.floor(Math.random() * colors.length)]));
            this.cursor = (this.cursor + 1) % FrBurst.CAPACITY;
        }
        if (this.mesh.instanceColor)
            this.mesh.instanceColor.needsUpdate = true;
    }
    update(dt) {
        this.particles.forEach((p, i) => {
            if (p.age >= p.life)
                return;
            p.age += dt;
            p.vy -= 16 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            const scale = p.age >= p.life ? 0 : p.size * (1 - p.age / p.life);
            this.matrix.makeScale(scale, scale, scale).setPosition(p.x, p.y, p.z);
            this.mesh.setMatrixAt(i, this.matrix);
        });
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
FrBurst.CAPACITY = 80;
class FrFade {
    constructor(overlay) {
        this.overlay = overlay;
    }
    apply(opacity, milliseconds) {
        this.overlay.style.transition = milliseconds > 0 ? "opacity " + milliseconds + "ms ease-in-out" : "none";
        this.overlay.style.opacity = String(opacity);
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }
    dim(opacity, milliseconds) { return this.apply(opacity, milliseconds); }
    blackout(milliseconds) { return this.apply(1, milliseconds); }
    snapBlack() { void this.apply(1, 0); }
    lift(milliseconds) { return this.apply(0, milliseconds); }
}
class FrTaskColors {
    static of(kind) { return FrTaskColors.CHIPS[kind] || [0xffffff]; }
    static success(kind) { return FrTaskColors.of(kind).concat([0xffd43a, 0xfff2a0, 0xffffff]); }
}
FrTaskColors.CHIPS = {
    chop: [0x8a5a2b, 0xc28f58, 0x5e8a3a], dig: [0x8a6038, 0x6f4b2b, 0x6fb84a], stone: [0x8a8d94, 0xa6a9b0, 0x74777e], snow: [0xffffff, 0xcff0ff, 0xa8dcf0],
    shake: [0xe5483f, 0x6fb84a], gatherRing: [0xf5c8d0, 0xe6d08f], harvest: [0x6fb84a, 0xf0872e], vein: [0x52e3ea, 0xa6a9b0], hardRock: [0x5a5d66, 0xa6a9b0],
};
