class FrMonsterAssets {
  static readonly FILES: Readonly<Record<string, string>> = {
    skeleton_minion: "Skeleton_Minion", skeleton_warrior: "Skeleton_Warrior", skeleton_rogue: "Skeleton_Rogue", skeleton_golem: "Skeleton_Golem",
  };
  private readonly templates = new Map<string, Three<"Object3D">>();
  private loading: Promise<void> | null = null;

  constructor(private readonly libs: ThreeLibs) {}

  load(): Promise<void> {
    if (!this.loading) {
      const loader = new this.libs.GLTFLoader();
      this.loading = Promise.all(Object.keys(FrMonsterAssets.FILES).map((id) => loader.loadAsync("assets/kaykit/characters/" + FrMonsterAssets.FILES[id] + ".glb").then((gltf) => { this.templates.set(id, gltf.scene); }))).then(() => undefined);
    }
    return this.loading;
  }

  clone(id: string): Three<"Object3D"> | null {
    const template = this.templates.get(id);
    return template ? this.libs.SkeletonUtils.clone(template) : null;
  }
}

class FrMonsterView {
  readonly group: Three<"Group">;
  private readonly mixer: Three<"AnimationMixer">;
  private readonly actions = new Map<string, Three<"AnimationAction">>();
  private readonly materials: Array<Three<"MeshStandardMaterial">> = [];
  private current = "";
  private shrink = 1;

  constructor(private readonly libs: ThreeLibs, model: Three<"Object3D">, clips: Map<string, Three<"AnimationClip">>, scale: number) {
    this.group = new libs.THREE.Group();
    this.group.add(model);
    model.scale.setScalar(scale);
    model.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const material = (mesh.material as Three<"MeshStandardMaterial">).clone();
      mesh.material = material;
      mesh.frustumCulled = false;
      if (material.emissive) this.materials.push(material);
    });
    this.mixer = new libs.THREE.AnimationMixer(model);
    const names: Record<string, string> = { walk: "Skeletons_Walking", idle: "Skeletons_Idle", windup: "Skeletons_Taunt", dead: "Skeletons_Death" };
    Object.keys(names).forEach((key) => { const clip = clips.get(names[key]); if (clip) this.actions.set(key, this.mixer.clipAction(clip)); });
    const dead = this.actions.get("dead");
    if (dead) { dead.setLoop(libs.THREE.LoopOnce, 1); dead.clampWhenFinished = true; }
    this.play("walk");
  }

  play(name: string): void {
    if (this.current === name) return;
    const next = this.actions.get(name);
    if (!next) return;
    const previous = this.actions.get(this.current);
    next.reset().fadeIn(0.12).play();
    if (previous) previous.fadeOut(0.12);
    this.current = name;
  }

  tint(red: number, white: number): void {
    this.materials.forEach((m) => m.emissive.setRGB(red + white, white, white));
  }

  update(dt: number, dead: boolean, deadFor: number): void {
    this.mixer.update(dt);
    if (dead) { this.shrink = Math.max(0, 1 - Math.max(0, deadFor - 0.7) / 0.5); this.group.scale.setScalar(this.shrink); }
  }
}

class FrMonsterLayer {
  private readonly views = new Map<number, FrMonsterView>();
  readonly group: Three<"Group">;

  constructor(private readonly libs: ThreeLibs, parent: Three<"Object3D">, private readonly assets: FrMonsterAssets, private readonly clips: Map<string, Three<"AnimationClip">>) {
    this.group = new libs.THREE.Group();
    parent.add(this.group);
  }

  update(monsters: ReadonlyArray<FrMonster>, terrain: FrTerrainData, dt: number, time: number): void {
    const seen = new Set<number>();
    monsters.forEach((m) => {
      seen.add(m.id);
      let view = this.views.get(m.id);
      if (!view) {
        const model = this.assets.clone(m.def.id);
        if (!model) return;
        view = new FrMonsterView(this.libs, model, this.clips, m.def.id === "skeleton_golem" ? 2.5 : 1.7);
        this.group.add(view.group);
        this.views.set(m.id, view);
      }
      view.group.position.set(m.x, Math.max(0, terrain.surfaceY(terrain.cellOf(m.x), terrain.cellOf(m.z))), m.z);
      view.group.rotation.y = m.facing;
      view.play(m.state === "dead" ? "dead" : m.state === "windup" ? "windup" : m.state === "recover" ? "idle" : "walk");
      const blink = m.state === "windup" ? 0.55 + 0.45 * Math.sin(time * 36) : 0;
      view.tint(Math.max(0, blink) * 0.7, m.flash > 0 ? 0.9 : 0);
      view.update(dt, m.state === "dead", m.deadFor);
    });
    this.views.forEach((view, id) => { if (!seen.has(id)) { this.group.remove(view.group); this.views.delete(id); } });
  }

  clear(): void {
    this.views.forEach((view) => this.group.remove(view.group));
    this.views.clear();
  }
}
