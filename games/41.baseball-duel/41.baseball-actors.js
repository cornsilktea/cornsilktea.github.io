"use strict";
class BbRigPoser {
    constructor(libs, model, space) {
        this.libs = libs;
        this.model = model;
        this.space = space;
        this.bones = new Map();
        this.restTurns = new Map();
        this.beforeTurns = new Map();
        this.footRestWorld = new Map();
        const THREE = libs.THREE;
        model.traverse((node) => {
            const simple = node.name.toLowerCase().replace(/[._]/g, "");
            if (BbRigPoser.NAMES.indexOf(simple) >= 0 && !this.bones.has(simple))
                this.bones.set(simple, node);
        });
        BbRigPoser.NAMES.forEach((name) => {
            if (!this.bones.has(name))
                throw new Error("뼈를 찾지 못했어요: " + name);
            this.restTurns.set(name, this.bone(name).quaternion.clone());
            this.beforeTurns.set(name, new THREE.Quaternion());
        });
        this.restHips = this.bone("hips").position.clone();
        this.beforeHips = new THREE.Vector3();
        this.pointA = new THREE.Vector3();
        this.pointB = new THREE.Vector3();
        this.pointC = new THREE.Vector3();
        this.target = new THREE.Vector3();
        this.pole = new THREE.Vector3();
        this.along = new THREE.Vector3();
        this.bend = new THREE.Vector3();
        this.fromDirection = new THREE.Vector3();
        this.toDirection = new THREE.Vector3();
        this.swing = new THREE.Quaternion();
        this.worldTurn = new THREE.Quaternion();
        this.parentTurn = new THREE.Quaternion();
        this.spaceTurn = new THREE.Quaternion();
        this.yawTurn = new THREE.Quaternion();
        this.euler = new THREE.Euler(0, 0, 0, "YXZ");
        this.scale = model.scale.x;
        this.metrics = this.measure();
    }
    bone(name) { return this.bones.get(name); }
    apply(frame, weight) {
        const blending = weight < 0.999;
        if (blending)
            this.remember();
        BbRigPoser.NAMES.forEach((name) => this.bone(name).quaternion.copy(this.restTurns.get(name)));
        const hips = this.bone("hips");
        this.bone("root").position.set(0, 0, 0);
        hips.position.set(frame.hips.x / this.scale, frame.hips.y / this.scale, frame.hips.z / this.scale);
        hips.quaternion.setFromEuler(this.euler.set(frame.hipsPitch, frame.hipsYaw, frame.hipsRoll, "YXZ"));
        this.euler.set(frame.chestPitch / 2, frame.chestYaw / 2, frame.chestRoll / 2, "YXZ");
        this.bone("spine").quaternion.setFromEuler(this.euler);
        this.bone("chest").quaternion.setFromEuler(this.euler);
        this.bone("head").quaternion.setFromEuler(this.euler.set(frame.headPitch, frame.headYaw, 0, "YXZ"));
        this.space.updateWorldMatrix(true, true);
        this.space.getWorldQuaternion(this.spaceTurn);
        const facing = frame.hipsYaw + frame.chestYaw;
        this.solveLimb("upperarml", "lowerarml", "handslotl", frame.handLeft, 0.45, -1, -0.55, facing);
        this.solveLimb("upperarmr", "lowerarmr", "handslotr", frame.handRight, -0.45, -1, -0.55, facing);
        this.solveLimb("upperlegl", "lowerlegl", "footl", frame.footLeft, 0.25, 0.15, 1, frame.hipsYaw);
        this.solveLimb("upperlegr", "lowerlegr", "footr", frame.footRight, -0.25, 0.15, 1, frame.hipsYaw);
        this.levelFoot("footl", frame.hipsYaw, frame.hipsPitch);
        this.levelFoot("footr", frame.hipsYaw, frame.hipsPitch);
        if (blending)
            this.blendBack(weight);
    }
    remember() {
        BbRigPoser.NAMES.forEach((name) => this.beforeTurns.get(name).copy(this.bone(name).quaternion));
        this.beforeHips.copy(this.bone("hips").position);
    }
    blendBack(weight) {
        BbRigPoser.NAMES.forEach((name) => {
            const solved = this.bone(name).quaternion;
            this.swing.copy(solved);
            solved.copy(this.beforeTurns.get(name)).slerp(this.swing, weight);
        });
        const hips = this.bone("hips");
        this.pointA.copy(hips.position);
        hips.position.copy(this.beforeHips).lerp(this.pointA, weight);
    }
    solveLimb(upperName, lowerName, endName, goal, poleX, poleY, poleZ, poleYaw) {
        const upper = this.bone(upperName), lower = this.bone(lowerName), end = this.bone(endName);
        upper.updateWorldMatrix(false, true);
        upper.getWorldPosition(this.pointA);
        lower.getWorldPosition(this.pointB);
        end.getWorldPosition(this.pointC);
        const upperLength = this.pointA.distanceTo(this.pointB), lowerLength = this.pointB.distanceTo(this.pointC);
        this.space.localToWorld(this.target.set(goal.x, goal.y, goal.z));
        const cos = Math.cos(poleYaw), sin = Math.sin(poleYaw);
        this.pole.set(poleX * cos + poleZ * sin, poleY, -poleX * sin + poleZ * cos).applyQuaternion(this.spaceTurn);
        this.along.subVectors(this.target, this.pointA);
        const reach = Math.max(Math.abs(upperLength - lowerLength) + 0.001, Math.min(upperLength + lowerLength - 0.0005, this.along.length()));
        this.along.normalize();
        const forward = (upperLength * upperLength - lowerLength * lowerLength + reach * reach) / (2 * reach);
        const sideways = Math.sqrt(Math.max(0, upperLength * upperLength - forward * forward));
        this.bend.copy(this.pole).addScaledVector(this.along, -this.pole.dot(this.along));
        if (this.bend.lengthSq() < 1e-8)
            this.bend.set(0, 1, 0);
        this.bend.normalize();
        this.pointB.copy(this.pointA).addScaledVector(this.along, forward).addScaledVector(this.bend, sideways);
        this.aim(upper, lower, this.pointB);
        this.aim(lower, end, this.target);
    }
    aim(bone, child, towardWorld) {
        bone.getWorldPosition(this.fromDirection);
        child.getWorldPosition(this.toDirection);
        this.pointC.copy(this.fromDirection);
        this.fromDirection.subVectors(this.toDirection, this.pointC).normalize();
        this.toDirection.subVectors(towardWorld, this.pointC).normalize();
        this.swing.setFromUnitVectors(this.fromDirection, this.toDirection);
        bone.getWorldQuaternion(this.worldTurn);
        this.worldTurn.premultiply(this.swing);
        bone.parent.getWorldQuaternion(this.parentTurn);
        bone.quaternion.copy(this.parentTurn.invert()).multiply(this.worldTurn);
        bone.updateWorldMatrix(false, true);
    }
    levelFoot(name, yaw, pitch) {
        const foot = this.bone(name);
        this.yawTurn.setFromEuler(this.euler.set(Math.min(0, pitch) * 0.6, yaw, 0, "YXZ"));
        this.worldTurn.copy(this.spaceTurn).multiply(this.yawTurn).multiply(this.footRestWorld.get(name));
        foot.parent.getWorldQuaternion(this.parentTurn);
        foot.quaternion.copy(this.parentTurn.invert()).multiply(this.worldTurn);
    }
    measure() {
        const THREE = this.libs.THREE;
        this.model.updateWorldMatrix(true, true);
        const base = this.model.getWorldPosition(new THREE.Vector3());
        const at = (name) => this.bone(name).getWorldPosition(new THREE.Vector3()).sub(base);
        ["footl", "footr"].forEach((name) => this.footRestWorld.set(name, this.bone(name).getWorldQuaternion(new THREE.Quaternion())));
        const hips = at("hips"), spine = at("spine"), chest = at("chest"), shoulder = at("upperarml"), elbow = at("lowerarml"), slot = at("handslotl");
        const hipJoint = at("upperlegl"), knee = at("lowerlegl"), ankle = at("footl");
        return {
            hipHeight: hips.y, spineLength: spine.y - hips.y, chestLength: chest.y - spine.y, shoulderRise: shoulder.y - chest.y, shoulderHalfWidth: Math.abs(shoulder.x),
            armReach: shoulder.distanceTo(elbow) + elbow.distanceTo(slot), hipJointHalfWidth: Math.abs(hipJoint.x), hipJointRise: hipJoint.y - hips.y,
            legReach: hipJoint.distanceTo(knee) + knee.distanceTo(ankle), ankleHeight: ankle.y
        };
    }
}
BbRigPoser.NAMES = ["root", "hips", "spine", "chest", "head", "upperarml", "lowerarml", "wristl", "handl", "handslotl", "upperarmr", "lowerarmr", "wristr", "handr", "handslotr",
    "upperlegl", "lowerlegl", "footl", "toesl", "upperlegr", "lowerlegr", "footr", "toesr"];
class BbTeamKits {
    static dress(look, kit) {
        return { c: look.c, cape: 0, hat: 0, p: { ...look.p, top: kit.jersey, arm: kit.sleeves, pants: kit.pants } };
    }
}
BbTeamKits.HOME = { jersey: "#F4F1E8", sleeves: "#1F4E9C", pants: "#F4F1E8", cap: "#1F4E9C", capBrim: "#16386F" };
BbTeamKits.AWAY = { jersey: "#C8452F", sleeves: "#2B2B33", pants: "#D9D6CC", cap: "#C8452F", capBrim: "#8E2E1F" };
BbTeamKits.UMPIRE = { jersey: "#22242B", sleeves: "#22242B", pants: "#3A3D47", cap: "#16171C", capBrim: "#16171C" };
class BbGearFactory {
    constructor(libs) {
        this.libs = libs;
        this.materials = new Map();
        const THREE = libs.THREE;
        this.capDome = new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
        this.helmetDome = new THREE.SphereGeometry(0.63, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
        this.brim = new THREE.CylinderGeometry(0.44, 0.44, 0.04, 18, 1, false, -Math.PI / 2, Math.PI);
        this.earFlap = new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
        this.glovePalm = new THREE.SphereGeometry(0.17, 14, 10);
        this.gloveThumb = new THREE.SphereGeometry(0.075, 10, 8);
        this.maskCage = new THREE.SphereGeometry(0.66, 12, 8, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.2, Math.PI * 0.62);
        this.chestPad = new THREE.SphereGeometry(0.3, 14, 10);
        this.belt = new THREE.TorusGeometry(0.43, 0.04, 6, 22);
        this.batGeometry = new THREE.LatheGeometry(BbBatShape.PROFILE.map(([radius, along]) => new THREE.Vector2(radius, along)), 20);
        this.batMaterial = new THREE.MeshStandardMaterial({ map: this.batTexture(), roughness: 0.48, metalness: 0.02 });
        this.cageMaterial = new THREE.MeshStandardMaterial({ color: "#2a2c33", roughness: 0.5, wireframe: true });
    }
    bat() {
        const mesh = new this.libs.THREE.Mesh(this.batGeometry, this.batMaterial);
        mesh.castShadow = true;
        mesh.visible = false;
        return mesh;
    }
    headGear(kind, kit, flapOnLeft) {
        const THREE = this.libs.THREE, group = new THREE.Group();
        const dome = new THREE.Mesh(kind === "helmet" ? this.helmetDome : this.capDome, this.material(kit.cap, kind === "helmet" ? 0.25 : 0.85));
        dome.position.y = kind === "helmet" ? 0.5 : 0.58;
        const brim = new THREE.Mesh(this.brim, this.material(kit.capBrim, kind === "helmet" ? 0.25 : 0.85));
        brim.position.set(0, dome.position.y + 0.02, 0.4);
        group.add(dome, brim);
        if (kind === "helmet") {
            const flap = new THREE.Mesh(this.earFlap, this.material(kit.cap, 0.25));
            flap.rotation.z = flapOnLeft ? -Math.PI / 2 : Math.PI / 2;
            flap.scale.set(1, 0.5, 1);
            flap.position.set(flapOnLeft ? 0.57 : -0.57, 0.4, 0.04);
            group.add(flap);
        }
        if (kind === "mask") {
            const cage = new THREE.Mesh(this.maskCage, this.cageMaterial);
            cage.position.set(0, 0.46, 0);
            group.add(cage);
        }
        group.traverse((node) => { node.castShadow = true; });
        return group;
    }
    glove() {
        const THREE = this.libs.THREE, group = new THREE.Group(), leather = this.material("#8A4B22", 0.7);
        const palm = new THREE.Mesh(this.glovePalm, leather);
        palm.scale.set(1, 1.25, 0.5);
        const thumb = new THREE.Mesh(this.gloveThumb, leather);
        thumb.position.set(0.16, -0.03, 0.03);
        const web = new THREE.Mesh(this.gloveThumb, this.material("#6E3A19", 0.7));
        web.position.set(0.1, 0.14, 0.01);
        web.scale.set(1, 1.2, 0.5);
        group.add(palm, thumb, web);
        group.traverse((node) => { node.castShadow = true; });
        return group;
    }
    chestProtector(color) {
        const mesh = new this.libs.THREE.Mesh(this.chestPad, this.material(color, 0.8));
        mesh.position.set(0, -0.02, 0.33);
        mesh.scale.set(1, 1.05, 0.34);
        return mesh;
    }
    beltRing() {
        const mesh = new this.libs.THREE.Mesh(this.belt, this.material("#1B1B20", 0.6));
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = 0.13;
        mesh.scale.set(1, 0.82, 1);
        return mesh;
    }
    material(color, roughness) {
        const key = color + "|" + roughness;
        let material = this.materials.get(key);
        if (!material) {
            material = new this.libs.THREE.MeshStandardMaterial({ color, roughness });
            this.materials.set(key, material);
        }
        return material;
    }
    batTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 512;
        const context = canvas.getContext("2d"), profile = BbBatShape.PROFILE, last = profile.length - 1;
        for (let row = 0; row < canvas.height; row++) {
            const position = (1 - row / (canvas.height - 1)) * last, index = Math.min(last - 1, Math.floor(position));
            const along = BbCurve.mix(profile[index][1], profile[index + 1][1], position - index);
            if (along < 0.03)
                context.fillStyle = "#3a2a1c";
            else if (along < BbBatShape.HANDLE_TAPE_END)
                context.fillStyle = Math.floor(along * 260) % 2 ? "#26262b" : "#34343b";
            else
                context.fillStyle = "rgb(" + Math.round(214 - along * 26) + "," + Math.round(160 - along * 30) + "," + Math.round(96 - along * 22) + ")";
            context.fillRect(0, row, canvas.width, 1);
        }
        context.globalAlpha = 0.16;
        context.strokeStyle = "#6b4423";
        for (let grain = 0; grain < 9; grain++) {
            context.beginPath();
            context.moveTo(grain * 7 + 3, 0);
            context.bezierCurveTo(grain * 7 + 9, 120, grain * 7 - 4, 220, grain * 7 + 4, 330);
            context.stroke();
        }
        context.globalAlpha = 1;
        context.fillStyle = "#1e3f7a";
        context.fillRect(0, 150, canvas.width, 5);
        context.fillRect(0, 160, canvas.width, 2);
        const texture = new this.libs.THREE.CanvasTexture(canvas);
        texture.colorSpace = this.libs.THREE.SRGBColorSpace;
        return texture;
    }
}
class BbPlayerActor {
    constructor(libs, factory, assets, gear, outfit) {
        this.libs = libs;
        this.shownYaw = 0;
        this.snapYaw = true;
        this.lastFrame = null;
        this.weight = 0;
        const THREE = libs.THREE;
        this.root = new THREE.Group();
        this.model = factory.build(BbTeamKits.dress(outfit.look, outfit.kit));
        this.model.traverse((node) => { if (node.isMesh)
            node.castShadow = true; });
        this.root.add(this.model);
        this.animator = new CharacterAnimator(libs, this.model, assets.clips);
        this.poser = new BbRigPoser(libs, this.model, this.root);
        this.poser.bone("head").add(gear.headGear(outfit.headGear, outfit.kit, outfit.flapOnLeft));
        this.poser.bone("hips").add(gear.beltRing());
        if (outfit.chestProtector)
            this.poser.bone("chest").add(gear.chestProtector(outfit.kit.sleeves));
        if (outfit.gloveSide) {
            const glove = gear.glove();
            glove.position.set(0, 0.03, 0);
            glove.rotation.set(0, 0, outfit.gloveSide === "left" ? Math.PI / 2 : -Math.PI / 2);
            this.poser.bone(outfit.gloveSide === "left" ? "handslotl" : "handslotr").add(glove);
        }
        this.bat = outfit.carriesBat ? gear.bat() : null;
        if (this.bat)
            this.root.add(this.bat);
        this.batAxis = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
    }
    update(deltaSeconds, placement, frame, gait, speed) {
        this.root.position.set(placement.position.x, placement.position.y, placement.position.z);
        this.turnToward(placement.yaw, deltaSeconds);
        if (gait === "walk")
            this.animator.play("Walking_A", { speed: Math.max(0.4, speed / BbPlayerActor.WALK_CLIP_SPEED) });
        else if (gait)
            this.animator.play("Running_A", { speed: BbCurve.clamp(speed / BbPlayerActor.RUN_CLIP_SPEED, 0.5, 1.6) });
        else
            this.animator.play("Idle_A");
        this.animator.update(deltaSeconds);
        this.model.rotation.x = gait === "run" && !frame ? 0.16 : 0;
        const step = deltaSeconds / BbPlayerActor.FADE_SECONDS;
        this.weight = BbCurve.clamp(this.weight + (frame ? step : -step), 0, 1);
        if (frame)
            this.lastFrame = frame;
        if (this.lastFrame && this.weight > 0)
            this.poser.apply(this.lastFrame, this.weight);
        this.placeBat(frame);
    }
    turnToward(yaw, deltaSeconds) {
        const gap = Math.atan2(Math.sin(yaw - this.shownYaw), Math.cos(yaw - this.shownYaw)), step = BbPlayerActor.TURN_SPEED * deltaSeconds;
        this.shownYaw = this.snapYaw || Math.abs(gap) <= step ? yaw : this.shownYaw + Math.sign(gap) * step;
        this.snapYaw = false;
        this.root.rotation.y = this.shownYaw;
    }
    snapTo(frame) {
        this.snapYaw = true;
        this.weight = frame ? 1 : 0;
        this.lastFrame = frame;
    }
    slotWorld(side, out) {
        return this.poser.bone(side === "left" ? "handslotl" : "handslotr").getWorldPosition(out);
    }
    batPointWorld(along, out) {
        if (!this.bat || !this.bat.visible)
            return null;
        return this.bat.localToWorld(out.set(0, along, 0));
    }
    placeBat(frame) {
        if (!this.bat)
            return;
        this.bat.visible = !!(frame && frame.bat);
        if (!frame || !frame.bat)
            return;
        this.bat.position.set(frame.bat.knob.x, frame.bat.knob.y, frame.bat.knob.z);
        this.bat.quaternion.setFromUnitVectors(this.up, this.batAxis.set(frame.bat.axis.x, frame.bat.axis.y, frame.bat.axis.z));
    }
}
BbPlayerActor.FADE_SECONDS = 0.09;
BbPlayerActor.RUN_CLIP_SPEED = 5.6;
BbPlayerActor.WALK_CLIP_SPEED = 1.9;
BbPlayerActor.TURN_SPEED = 12;
class BbBallActor {
    constructor(libs) {
        this.heldBy = null;
        const THREE = libs.THREE;
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BbBallActor.VISUAL_RADIUS, 18, 12), new THREE.MeshStandardMaterial({ map: BbBallActor.seamTexture(libs), roughness: 0.55 }));
        this.mesh.castShadow = true;
        const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.32, depthWrite: false });
        this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), shadowMaterial);
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.renderOrder = 2;
        this.slot = new THREE.Vector3();
        this.releaseOffset = new THREE.Vector3();
        this.spinAxis = new THREE.Vector3(1, 0, 0);
    }
    update(state, holder, side, deltaSeconds) {
        this.mesh.visible = this.shadow.visible = !!state;
        if (!state)
            return;
        if (state.holder && holder) {
            holder.slotWorld(side, this.slot);
            this.heldBy = state.holder;
            this.mesh.position.copy(this.slot);
        }
        else {
            if (this.heldBy !== null) {
                this.releaseOffset.copy(this.mesh.position).sub(this.slot.set(state.origin.x, state.origin.y, state.origin.z));
                this.heldBy = null;
            }
            const fade = 1 - BbCurve.span(state.sinceStart, 0, BbBallActor.RELEASE_BLEND_SECONDS);
            this.mesh.position.set(state.point.x, state.point.y, state.point.z).addScaledVector(this.releaseOffset, fade);
            this.mesh.rotateOnWorldAxis(this.spinAxis, -state.spin * deltaSeconds);
        }
        const height = Math.max(0, this.mesh.position.y);
        this.shadow.position.set(this.mesh.position.x, 0.03, this.mesh.position.z);
        this.shadow.scale.setScalar(1 + Math.min(height, 30) * 0.12);
        this.shadow.material.opacity = 0.34 / (1 + height * 0.18);
    }
    forgetHolder() {
        this.heldBy = null;
        this.releaseOffset.set(0, 0, 0);
    }
    static seamTexture(libs) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        context.fillStyle = "#f6f3ea";
        context.fillRect(0, 0, 256, 128);
        context.strokeStyle = "#c8322b";
        context.lineWidth = 3;
        [0, 128].forEach((shift) => {
            context.beginPath();
            for (let x = 0; x <= 128; x += 4)
                context.lineTo(shift + x, 64 + Math.sin(x / 128 * Math.PI * 2) * 34);
            context.stroke();
            for (let x = 2; x <= 128; x += 8) {
                const y = 64 + Math.sin(x / 128 * Math.PI * 2) * 34;
                context.beginPath();
                context.moveTo(shift + x - 3, y - 7);
                context.lineTo(shift + x + 3, y + 7);
                context.stroke();
            }
        });
        const texture = new libs.THREE.CanvasTexture(canvas);
        texture.colorSpace = libs.THREE.SRGBColorSpace;
        return texture;
    }
}
BbBallActor.VISUAL_RADIUS = 0.07;
BbBallActor.RELEASE_BLEND_SECONDS = 0.1;
