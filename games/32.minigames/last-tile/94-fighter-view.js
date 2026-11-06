"use strict";
class FighterClips {
}
FighterClips.IDLE = "Idle_A";
FighterClips.RUN = "Running_A";
FighterClips.PUSH = "Melee_1H_Attack_Chop";
FighterClips.HIT = "Hit_A";
class FloorVisibility {
    constructor(shownFloor, y, shownHeight) {
        this.shownFloor = shownFloor;
        this.y = y;
        this.shownHeight = shownHeight;
    }
    grounded(floor) { return floor <= this.shownFloor; }
    falling() { return this.y < this.shownHeight + 6; }
    out() { return false; }
}
class AnimationPlanner {
    constructor(fighter, t, simulatedHere) {
        this.fighter = fighter;
        this.t = t;
        this.simulatedHere = simulatedHere;
    }
    falling() { return { clip: FighterClips.HIT, speed: 1.6, once: false }; }
    out() { return { clip: FighterClips.IDLE, speed: 1, once: false }; }
    grounded(floor) {
        const fighter = this.fighter;
        if (fighter.isDashAnimating(this.t))
            return { clip: FighterClips.RUN, speed: 2.4, once: false };
        if (fighter.isPushAnimating(this.t))
            return { clip: FighterClips.PUSH, speed: 1.8, once: true };
        if (fighter.isHitAnimating(this.t) && this.simulatedHere)
            return { clip: FighterClips.HIT, speed: 1.4, once: true };
        const speed = fighter.speed();
        if (speed > 0.6)
            return { clip: FighterClips.RUN, speed: MathUtil.clamp(speed / 5, 0.7, 1.5), once: false };
        return { clip: FighterClips.IDLE, speed: 1, once: false };
    }
}
class NameTagFactory {
    constructor(libs, page) {
        this.libs = libs;
        this.page = page;
    }
    create(text, color) {
        const THREE = this.libs.THREE;
        const canvas = this.page.createCanvas(NameTagFactory.WIDTH, NameTagFactory.HEIGHT);
        const context = canvas.getContext("2d");
        this.roundedRect(context, 4, 6, 248, 52, 14);
        context.fillStyle = Palette.LABEL_BACKGROUND;
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
    roundedRect(context, x, y, width, height, radius) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + width - radius, y);
        context.arcTo(x + width, y, x + width, y + radius, radius);
        context.lineTo(x + width, y + height - radius);
        context.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        context.lineTo(x + radius, y + height);
        context.arcTo(x, y + height, x, y + height - radius, radius);
        context.lineTo(x, y + radius);
        context.arcTo(x, y, x + radius, y, radius);
        context.closePath();
    }
}
NameTagFactory.WIDTH = 256;
NameTagFactory.HEIGHT = 64;
class FighterViewKit {
    constructor(libs, page, labels) {
        this.libs = libs;
        this.labels = labels;
        const THREE = libs.THREE;
        const canvas = page.createCanvas(64, 64);
        const context = canvas.getContext("2d");
        const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
        gradient.addColorStop(0, Palette.SHADOW);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
        this.blobMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false });
        this.blobGeometry = new THREE.PlaneGeometry(1.5, 1.5);
        this.ringGeometry = new THREE.RingGeometry(0.55, 0.74, 28);
    }
}
class FighterView {
    constructor(kit, factory, clips, world, participant, look, initialYaw) {
        this.kit = kit;
        this.factory = factory;
        this.world = world;
        this.shownYaw = 0;
        this.spin = 0;
        const THREE = kit.libs.THREE;
        const color = Palette.slotColor(participant.slot);
        this.shownYaw = initialYaw;
        this.group = new THREE.Group();
        this.inner = new THREE.Group();
        this.model = factory.build(look);
        this.inner.add(this.model);
        this.ring = new THREE.Mesh(kit.ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = 0.04;
        this.label = kit.labels.create(participant.nick + (participant.ai ? " (AI)" : ""), color);
        this.label.position.y = 2.75;
        this.blob = new THREE.Mesh(kit.blobGeometry, kit.blobMaterial);
        this.blob.rotation.x = -Math.PI / 2;
        this.group.add(this.inner, this.ring, this.label);
        world.add(this.group, this.blob);
        this.animator = new CharacterAnimator(kit.libs, this.model, clips);
        this.animator.play(FighterClips.IDLE);
    }
    update(fighter, context) {
        const shownHeight = LastTileGeometry.floorY(context.shownFloor);
        let visible = !fighter.isOut() && !fighter.hasLeft();
        if (visible && fighter !== context.subject)
            visible = fighter.inspect(new FloorVisibility(context.shownFloor, fighter.y, shownHeight));
        this.group.visible = visible;
        this.blob.visible = visible;
        if (!visible)
            return;
        this.pose(fighter, context, shownHeight);
        const plan = fighter.inspect(new AnimationPlanner(fighter, context.t, context.simulatedHere));
        this.animator.play(plan.clip, { speed: plan.speed, once: plan.once });
        this.animator.update(context.dt);
    }
    dispose() {
        this.world.remove(this.group);
        this.world.remove(this.blob);
        this.factory.disposeModel(this.model);
        this.ring.material.dispose();
        const labelMaterial = this.label.material;
        if (labelMaterial.map)
            labelMaterial.map.dispose();
        labelMaterial.dispose();
    }
    pose(fighter, context, shownHeight) {
        const falling = fighter.isFalling();
        let tumble = 0;
        if (falling) {
            this.spin += context.dt * 6;
            tumble = Math.sin(this.spin) * 0.35;
        }
        else {
            this.spin = 0;
        }
        this.group.position.set(fighter.x, fighter.y, fighter.z);
        this.shownYaw += MathUtil.angleDifference(fighter.yaw, this.shownYaw) * Math.min(1, context.dt * 16);
        this.inner.rotation.y = this.shownYaw;
        this.inner.rotation.x = falling ? tumble : (fighter.isDashAnimating(context.t) ? 0.35 : 0);
        const grounded = fighter.isGrounded();
        const surfaceY = grounded ? fighter.y : shownHeight;
        this.blob.position.set(fighter.x, surfaceY + 0.03, fighter.z);
        const height = grounded ? 0 : Math.max(0, fighter.y - surfaceY);
        this.blob.scale.setScalar(MathUtil.clamp(1 - height / 12, 0.3, 1));
        this.blob.visible = grounded || fighter.y > shownHeight;
        this.ring.visible = grounded;
    }
}
