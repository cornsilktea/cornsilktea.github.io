type BbBone = Three<"Object3D">;
type BbBoneName = "root" | "hips" | "spine" | "chest" | "head" | "upperarml" | "lowerarml" | "wristl" | "handl" | "handslotl" | "upperarmr" | "lowerarmr" | "wristr" | "handr" | "handslotr"
  | "upperlegl" | "lowerlegl" | "footl" | "toesl" | "upperlegr" | "lowerlegr" | "footr" | "toesr";

class BbRigPoser {
  private static readonly NAMES: readonly BbBoneName[] = ["root", "hips", "spine", "chest", "head", "upperarml", "lowerarml", "wristl", "handl", "handslotl", "upperarmr", "lowerarmr", "wristr", "handr", "handslotr",
    "upperlegl", "lowerlegl", "footl", "toesl", "upperlegr", "lowerlegr", "footr", "toesr"];
  private readonly bones = new Map<BbBoneName, BbBone>();
  private readonly restTurns = new Map<BbBoneName, Three<"Quaternion">>();
  private readonly beforeTurns = new Map<BbBoneName, Three<"Quaternion">>();
  private readonly footRestWorld = new Map<BbBoneName, Three<"Quaternion">>();
  private readonly restHips: Three<"Vector3">;
  private readonly beforeHips: Three<"Vector3">;
  private readonly pointA: Three<"Vector3">;
  private readonly pointB: Three<"Vector3">;
  private readonly pointC: Three<"Vector3">;
  private readonly target: Three<"Vector3">;
  private readonly pole: Three<"Vector3">;
  private readonly along: Three<"Vector3">;
  private readonly bend: Three<"Vector3">;
  private readonly fromDirection: Three<"Vector3">;
  private readonly toDirection: Three<"Vector3">;
  private readonly swing: Three<"Quaternion">;
  private readonly worldTurn: Three<"Quaternion">;
  private readonly parentTurn: Three<"Quaternion">;
  private readonly spaceTurn: Three<"Quaternion">;
  private readonly yawTurn: Three<"Quaternion">;
  private readonly euler: Three<"Euler">;
  private readonly scale: number;
  readonly metrics: BbBodyMetrics;

  constructor(private readonly libs: ThreeLibs, private readonly model: Three<"Object3D">, private readonly space: Three<"Object3D">) {
    const THREE = libs.THREE;
    model.traverse((node) => {
      const simple = node.name.toLowerCase().replace(/[._]/g, "") as BbBoneName;
      if (BbRigPoser.NAMES.indexOf(simple) >= 0 && !this.bones.has(simple)) this.bones.set(simple, node);
    });
    BbRigPoser.NAMES.forEach((name) => {
      if (!this.bones.has(name)) throw new Error("뼈를 찾지 못했어요: " + name);
      this.restTurns.set(name, this.bone(name).quaternion.clone());
      this.beforeTurns.set(name, new THREE.Quaternion());
    });
    this.restHips = this.bone("hips").position.clone();
    this.beforeHips = new THREE.Vector3();
    this.pointA = new THREE.Vector3(); this.pointB = new THREE.Vector3(); this.pointC = new THREE.Vector3();
    this.target = new THREE.Vector3(); this.pole = new THREE.Vector3(); this.along = new THREE.Vector3(); this.bend = new THREE.Vector3();
    this.fromDirection = new THREE.Vector3(); this.toDirection = new THREE.Vector3();
    this.swing = new THREE.Quaternion(); this.worldTurn = new THREE.Quaternion(); this.parentTurn = new THREE.Quaternion(); this.spaceTurn = new THREE.Quaternion(); this.yawTurn = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.scale = model.scale.x;
    this.metrics = this.measure();
  }

  bone(name: BbBoneName): BbBone { return this.bones.get(name) as BbBone; }

  apply(frame: BbPoseFrame, weight: number): void {
    const blending = weight < 0.999;
    if (blending) this.remember();
    BbRigPoser.NAMES.forEach((name) => this.bone(name).quaternion.copy(this.restTurns.get(name) as Three<"Quaternion">));
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
    if (blending) this.blendBack(weight);
  }

  private remember(): void {
    BbRigPoser.NAMES.forEach((name) => (this.beforeTurns.get(name) as Three<"Quaternion">).copy(this.bone(name).quaternion));
    this.beforeHips.copy(this.bone("hips").position);
  }

  private blendBack(weight: number): void {
    BbRigPoser.NAMES.forEach((name) => {
      const solved = this.bone(name).quaternion;
      this.swing.copy(solved);
      solved.copy(this.beforeTurns.get(name) as Three<"Quaternion">).slerp(this.swing, weight);
    });
    const hips = this.bone("hips");
    this.pointA.copy(hips.position);
    hips.position.copy(this.beforeHips).lerp(this.pointA, weight);
  }

  private solveLimb(upperName: BbBoneName, lowerName: BbBoneName, endName: BbBoneName, goal: BbVec, poleX: number, poleY: number, poleZ: number, poleYaw: number): void {
    const upper = this.bone(upperName), lower = this.bone(lowerName), end = this.bone(endName);
    upper.updateWorldMatrix(false, true);
    upper.getWorldPosition(this.pointA); lower.getWorldPosition(this.pointB); end.getWorldPosition(this.pointC);
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
    if (this.bend.lengthSq() < 1e-8) this.bend.set(0, 1, 0);
    this.bend.normalize();
    this.pointB.copy(this.pointA).addScaledVector(this.along, forward).addScaledVector(this.bend, sideways);
    this.aim(upper, lower, this.pointB);
    this.aim(lower, end, this.target);
  }

  private aim(bone: BbBone, child: BbBone, towardWorld: Three<"Vector3">): void {
    bone.getWorldPosition(this.fromDirection);
    child.getWorldPosition(this.toDirection);
    this.pointC.copy(this.fromDirection);
    this.fromDirection.subVectors(this.toDirection, this.pointC).normalize();
    this.toDirection.subVectors(towardWorld, this.pointC).normalize();
    this.swing.setFromUnitVectors(this.fromDirection, this.toDirection);
    bone.getWorldQuaternion(this.worldTurn);
    this.worldTurn.premultiply(this.swing);
    (bone.parent as BbBone).getWorldQuaternion(this.parentTurn);
    bone.quaternion.copy(this.parentTurn.invert()).multiply(this.worldTurn);
    bone.updateWorldMatrix(false, true);
  }

  private levelFoot(name: BbBoneName, yaw: number, pitch: number): void {
    const foot = this.bone(name);
    this.yawTurn.setFromEuler(this.euler.set(Math.min(0, pitch) * 0.6, yaw, 0, "YXZ"));
    this.worldTurn.copy(this.spaceTurn).multiply(this.yawTurn).multiply(this.footRestWorld.get(name) as Three<"Quaternion">);
    (foot.parent as BbBone).getWorldQuaternion(this.parentTurn);
    foot.quaternion.copy(this.parentTurn.invert()).multiply(this.worldTurn);
  }

  private measure(): BbBodyMetrics {
    const THREE = this.libs.THREE;
    this.model.updateWorldMatrix(true, true);
    const base = this.model.getWorldPosition(new THREE.Vector3());
    const at = (name: BbBoneName) => this.bone(name).getWorldPosition(new THREE.Vector3()).sub(base);
    (["footl", "footr"] as BbBoneName[]).forEach((name) => this.footRestWorld.set(name, this.bone(name).getWorldQuaternion(new THREE.Quaternion())));
    const hips = at("hips"), spine = at("spine"), chest = at("chest"), shoulder = at("upperarml"), elbow = at("lowerarml"), slot = at("handslotl");
    const hipJoint = at("upperlegl"), knee = at("lowerlegl"), ankle = at("footl");
    return {
      hipHeight: hips.y, spineLength: spine.y - hips.y, chestLength: chest.y - spine.y, shoulderRise: shoulder.y - chest.y, shoulderHalfWidth: Math.abs(shoulder.x),
      armReach: shoulder.distanceTo(elbow) + elbow.distanceTo(slot), hipJointHalfWidth: Math.abs(hipJoint.x), hipJointRise: hipJoint.y - hips.y,
      legReach: hipJoint.distanceTo(knee) + knee.distanceTo(ankle), ankleHeight: ankle.y
    };
  }
}

interface BbTeamKit {
  jersey: string;
  sleeves: string;
  pants: string;
  cap: string;
  capBrim: string;
}

class BbTeamKits {
  static readonly HOME: BbTeamKit = { jersey: "#F4F1E8", sleeves: "#1F4E9C", pants: "#F4F1E8", cap: "#1F4E9C", capBrim: "#16386F" };
  static readonly AWAY: BbTeamKit = { jersey: "#C8452F", sleeves: "#2B2B33", pants: "#D9D6CC", cap: "#C8452F", capBrim: "#8E2E1F" };
  static readonly UMPIRE: BbTeamKit = { jersey: "#22242B", sleeves: "#22242B", pants: "#3A3D47", cap: "#16171C", capBrim: "#16171C" };

  static dress(look: CharacterLook, kit: BbTeamKit): CharacterLook {
    return { c: look.c, cape: 0, hat: 0, p: { ...look.p, top: kit.jersey, arm: kit.sleeves, pants: kit.pants } };
  }
}

type BbHeadGear = "cap" | "helmet" | "mask";

class BbGearFactory {
  private readonly materials = new Map<string, Three<"MeshStandardMaterial">>();
  private readonly capDome: Three<"SphereGeometry">;
  private readonly helmetDome: Three<"SphereGeometry">;
  private readonly brim: Three<"CylinderGeometry">;
  private readonly earFlap: Three<"SphereGeometry">;
  private readonly glovePalm: Three<"SphereGeometry">;
  private readonly gloveThumb: Three<"SphereGeometry">;
  private readonly maskCage: Three<"SphereGeometry">;
  private readonly chestPad: Three<"SphereGeometry">;
  private readonly belt: Three<"TorusGeometry">;
  private readonly batGeometry: Three<"LatheGeometry">;
  private readonly batMaterial: Three<"MeshStandardMaterial">;
  private readonly cageMaterial: Three<"MeshStandardMaterial">;

  constructor(private readonly libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.capDome = new THREE.SphereGeometry(0.57, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    this.helmetDome = new THREE.SphereGeometry(0.63, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
    this.brim = new THREE.CylinderGeometry(0.38, 0.38, 0.04, 18, 1, false, -Math.PI / 2, Math.PI);
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

  bat(): Three<"Mesh"> {
    const mesh = new this.libs.THREE.Mesh(this.batGeometry, this.batMaterial);
    mesh.castShadow = true;
    mesh.visible = false;
    return mesh;
  }

  headGear(kind: BbHeadGear, kit: BbTeamKit, flapOnLeft: boolean): Three<"Group"> {
    const THREE = this.libs.THREE, group = new THREE.Group();
    const dome = new THREE.Mesh(kind === "helmet" ? this.helmetDome : this.capDome, this.material(kit.cap, kind === "helmet" ? 0.25 : 0.85));
    dome.position.y = kind === "helmet" ? 0.5 : 0.68;
    const brim = new THREE.Mesh(this.brim, this.material(kit.capBrim, kind === "helmet" ? 0.25 : 0.85));
    brim.position.set(0, dome.position.y + 0.02, kind === "helmet" ? 0.46 : 0.4);
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

  glove(): Three<"Group"> {
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

  chestProtector(color: string): Three<"Mesh"> {
    const mesh = new this.libs.THREE.Mesh(this.chestPad, this.material(color, 0.8));
    mesh.position.set(0, -0.02, 0.33);
    mesh.scale.set(1, 1.05, 0.34);
    return mesh;
  }

  beltRing(): Three<"Mesh"> {
    const mesh = new this.libs.THREE.Mesh(this.belt, this.material("#1B1B20", 0.6));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.13;
    mesh.scale.set(1, 0.82, 1);
    return mesh;
  }

  private material(color: string, roughness: number): Three<"MeshStandardMaterial"> {
    const key = color + "|" + roughness;
    let material = this.materials.get(key);
    if (!material) {
      material = new this.libs.THREE.MeshStandardMaterial({ color, roughness });
      this.materials.set(key, material);
    }
    return material;
  }

  private batTexture(): Three<"CanvasTexture"> {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 512;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D, profile = BbBatShape.PROFILE, last = profile.length - 1;
    for (let row = 0; row < canvas.height; row++) {
      const position = (1 - row / (canvas.height - 1)) * last, index = Math.min(last - 1, Math.floor(position));
      const along = BbCurve.mix(profile[index][1], profile[index + 1][1], position - index);
      if (along < 0.03) context.fillStyle = "#3a2a1c";
      else if (along < BbBatShape.HANDLE_TAPE_END) context.fillStyle = Math.floor(along * 260) % 2 ? "#26262b" : "#34343b";
      else context.fillStyle = "rgb(" + Math.round(214 - along * 26) + "," + Math.round(160 - along * 30) + "," + Math.round(96 - along * 22) + ")";
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

interface BbActorOutfit {
  look: CharacterLook;
  kit: BbTeamKit;
  headGear: BbHeadGear;
  gloveSide: BbSide | null;
  chestProtector: boolean;
  carriesBat: boolean;
  flapOnLeft: boolean;
}

class BbPlayerActor {
  private static readonly FADE_SECONDS = 0.09;
  private static readonly RUN_CLIP_SPEED = 5.6;
  private static readonly WALK_CLIP_SPEED = 1.9;

  readonly root: Three<"Group">;
  readonly poser: BbRigPoser;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly bat: Three<"Mesh"> | null;
  private readonly batAxis: Three<"Vector3">;
  private readonly up: Three<"Vector3">;
  private static readonly TURN_SPEED = 12;
  private shownYaw = 0;
  private snapYaw = true;
  private lastFrame: BbPoseFrame | null = null;
  private weight = 0;

  constructor(private readonly libs: ThreeLibs, factory: CharacterModelFactory, assets: CharacterAssets, gear: BbGearFactory, readonly outfit: BbActorOutfit) {
    const THREE = libs.THREE;
    this.root = new THREE.Group();
    this.model = factory.build(BbTeamKits.dress(outfit.look, outfit.kit));
    this.model.traverse((node) => { if ((node as Three<"Mesh">).isMesh) node.castShadow = true; });
    this.root.add(this.model);
    this.animator = new CharacterAnimator(libs, this.model, assets.clips);
    this.poser = new BbRigPoser(libs, this.model, this.root);
    this.poser.bone("head").add(gear.headGear(outfit.headGear, outfit.kit, outfit.flapOnLeft));
    this.poser.bone("hips").add(gear.beltRing());
    if (outfit.chestProtector) this.poser.bone("chest").add(gear.chestProtector(outfit.kit.sleeves));
    if (outfit.gloveSide) {
      const glove = gear.glove();
      glove.position.set(0, 0.03, 0);
      glove.rotation.set(0, 0, outfit.gloveSide === "left" ? Math.PI / 2 : -Math.PI / 2);
      this.poser.bone(outfit.gloveSide === "left" ? "handslotl" : "handslotr").add(glove);
    }
    this.bat = outfit.carriesBat ? gear.bat() : null;
    if (this.bat) this.root.add(this.bat);
    this.batAxis = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  update(deltaSeconds: number, placement: BbActorPlacement, frame: BbPoseFrame | null, gait: BbGait | null, speed: number): void {
    this.root.position.set(placement.position.x, placement.position.y, placement.position.z);
    this.turnToward(placement.yaw, deltaSeconds);
    if (gait === "walk") this.animator.play("Walking_A", { speed: Math.max(0.4, speed / BbPlayerActor.WALK_CLIP_SPEED) });
    else if (gait) this.animator.play("Running_A", { speed: BbCurve.clamp(speed / BbPlayerActor.RUN_CLIP_SPEED, 0.5, 1.6) });
    else this.animator.play("Idle_A");
    this.animator.update(deltaSeconds);
    this.model.rotation.x = gait === "run" && !frame ? 0.16 : 0;
    const step = deltaSeconds / BbPlayerActor.FADE_SECONDS;
    this.weight = BbCurve.clamp(this.weight + (frame ? step : -step), 0, 1);
    if (frame) this.lastFrame = frame;
    if (this.lastFrame && this.weight > 0) this.poser.apply(this.lastFrame, this.weight);
    this.placeBat(frame);
  }

  standStill(seconds: number): void {
    this.animator.play("Idle_A");
    this.animator.update(seconds);
  }

  private turnToward(yaw: number, deltaSeconds: number): void {
    const gap = Math.atan2(Math.sin(yaw - this.shownYaw), Math.cos(yaw - this.shownYaw)), step = BbPlayerActor.TURN_SPEED * deltaSeconds;
    this.shownYaw = this.snapYaw || Math.abs(gap) <= step ? yaw : this.shownYaw + Math.sign(gap) * step;
    this.snapYaw = false;
    this.root.rotation.y = this.shownYaw;
  }

  snapTo(frame: BbPoseFrame | null): void {
    this.snapYaw = true;
    this.weight = frame ? 1 : 0;
    this.lastFrame = frame;
  }

  slotWorld(side: BbSide, out: Three<"Vector3">): Three<"Vector3"> {
    return this.poser.bone(side === "left" ? "handslotl" : "handslotr").getWorldPosition(out);
  }

  batPointWorld(along: number, out: Three<"Vector3">): Three<"Vector3"> | null {
    if (!this.bat || !this.bat.visible) return null;
    return this.bat.localToWorld(out.set(0, along, 0));
  }

  private placeBat(frame: BbPoseFrame | null): void {
    if (!this.bat) return;
    this.bat.visible = !!(frame && frame.bat);
    if (!frame || !frame.bat) return;
    this.bat.position.set(frame.bat.knob.x, frame.bat.knob.y, frame.bat.knob.z);
    this.bat.quaternion.setFromUnitVectors(this.up, this.batAxis.set(frame.bat.axis.x, frame.bat.axis.y, frame.bat.axis.z));
  }
}

class BbBallActor {
  static readonly VISUAL_RADIUS = 0.07;
  private static readonly RELEASE_BLEND_SECONDS = 0.1;
  private static readonly SHADOW_RADIUS = 0.062;
  private static readonly SHADOW_GROWTH = 0.22;
  private static readonly SHADOW_LIFT = 0.012;

  readonly mesh: Three<"Mesh">;
  readonly shadow: Three<"Mesh">;
  private readonly slot: Three<"Vector3">;
  private readonly releaseOffset: Three<"Vector3">;
  private readonly spinAxis: Three<"Vector3">;
  private heldBy: BbRoleId | null = null;

  constructor(libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BbBallActor.VISUAL_RADIUS, 18, 12), new THREE.MeshStandardMaterial({ map: BbBallActor.seamTexture(libs), roughness: 0.55 }));
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.32, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(BbBallActor.SHADOW_RADIUS, 16), shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    this.slot = new THREE.Vector3();
    this.releaseOffset = new THREE.Vector3();
    this.spinAxis = new THREE.Vector3(1, 0, 0);
  }

  update(state: BbBallState | null, holder: BbPlayerActor | null, side: BbSide, deltaSeconds: number): void {
    this.mesh.visible = this.shadow.visible = !!state;
    if (!state) return;
    if (state.holder && holder) {
      holder.slotWorld(side, this.slot);
      this.heldBy = state.holder;
      this.mesh.position.copy(this.slot);
    } else {
      if (this.heldBy !== null) {
        this.releaseOffset.copy(this.mesh.position).sub(this.slot.set(state.origin.x, state.origin.y, state.origin.z));
        this.heldBy = null;
      }
      const fade = 1 - BbCurve.span(state.sinceStart, 0, BbBallActor.RELEASE_BLEND_SECONDS);
      this.mesh.position.set(state.point.x, state.point.y, state.point.z).addScaledVector(this.releaseOffset, fade);
      if (state.axis) this.spinAxis.set(state.axis.x, state.axis.y, state.axis.z).normalize();
      else this.spinAxis.set(1, 0, 0);
      this.mesh.rotateOnWorldAxis(this.spinAxis, -state.spin * deltaSeconds);
    }
    const height = Math.max(0, this.mesh.position.y);
    this.shadow.position.set(this.mesh.position.x, BbBallActor.SHADOW_LIFT, this.mesh.position.z);
    this.shadow.scale.setScalar(1 + Math.min(height, 30) * BbBallActor.SHADOW_GROWTH);
    (this.shadow.material as Three<"MeshBasicMaterial">).opacity = 0.4 / (1 + height * 0.18);
  }

  forgetHolder(): void {
    this.heldBy = null;
    this.releaseOffset.set(0, 0, 0);
  }

  private static seamTexture(libs: ThreeLibs): Three<"CanvasTexture"> {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 128;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.fillStyle = "#f6f3ea";
    context.fillRect(0, 0, 256, 128);
    context.strokeStyle = "#c8322b";
    context.lineWidth = 3;
    [0, 128].forEach((shift) => {
      context.beginPath();
      for (let x = 0; x <= 128; x += 4) context.lineTo(shift + x, 64 + Math.sin(x / 128 * Math.PI * 2) * 34);
      context.stroke();
      for (let x = 2; x <= 128; x += 8) {
        const y = 64 + Math.sin(x / 128 * Math.PI * 2) * 34;
        context.beginPath(); context.moveTo(shift + x - 3, y - 7); context.lineTo(shift + x + 3, y + 7); context.stroke();
      }
    });
    const texture = new libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = libs.THREE.SRGBColorSpace;
    return texture;
  }
}

class BbWardrobe {
  constructor(private readonly libs: ThreeLibs, private readonly factory: CharacterModelFactory, private readonly assets: CharacterAssets, private readonly gear: BbGearFactory) {}

  static sameLook(a: CharacterLook, b: CharacterLook): boolean { return JSON.stringify(a) === JSON.stringify(b); }

  static lookOf(raw: CharacterLook | null | undefined, fallback: CharacterLook): CharacterLook { return raw ? CharacterLooks.clean(raw) : fallback; }

  actor(outfit: BbActorOutfit): BbPlayerActor { return new BbPlayerActor(this.libs, this.factory, this.assets, this.gear, outfit); }
}

class BbPortraitStudio {
  private static readonly SIZE = 160;
  private readonly cache = new Map<string, string>();
  private renderer: Three<"WebGLRenderer"> | null = null;
  private scene: Three<"Scene"> | null = null;
  private camera: Three<"PerspectiveCamera"> | null = null;

  constructor(private readonly libs: ThreeLibs, private readonly wardrobe: BbWardrobe) {}

  shoot(look: CharacterLook, kit: BbTeamKit): string | null {
    const key = JSON.stringify(look) + "|" + kit.cap;
    const cached = this.cache.get(key);
    if (cached) return cached;
    try {
      const url = this.render(look, kit);
      this.cache.set(key, url);
      return url;
    } catch (error) {
      return null;
    }
  }

  private render(look: CharacterLook, kit: BbTeamKit): string {
    const THREE = this.libs.THREE;
    if (!this.renderer || !this.scene || !this.camera) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = BbPortraitStudio.SIZE;
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setSize(BbPortraitStudio.SIZE, BbPortraitStudio.SIZE, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.HemisphereLight(0xfff6e4, 0x5a6a50, 1.4));
      const sun = new THREE.DirectionalLight(0xffefd2, 1.3);
      sun.position.set(-2, 4, 5);
      this.scene.add(sun);
      this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    }
    const actor = this.wardrobe.actor({ look, kit, headGear: "cap", gloveSide: null, chestProtector: false, carriesBat: false, flapOnLeft: false });
    actor.standStill(0.4);
    this.scene.add(actor.root);
    actor.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(actor.root), size = box.getSize(new THREE.Vector3()), focus = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - size.y * 0.24, (box.min.z + box.max.z) / 2);
    const distance = size.y * 0.42 / Math.tan(13 * Math.PI / 180) + size.z * 0.5;
    this.camera.position.set(focus.x + distance * 0.18, focus.y + size.y * 0.04, focus.z + distance);
    this.camera.lookAt(focus);
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(actor.root);
    return this.renderer.domElement.toDataURL("image/png");
  }
}
