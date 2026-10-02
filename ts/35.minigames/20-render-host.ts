class RenderHost {
  static readonly TOUCH_PIXEL_RATIO_LIMIT = 1.5;
  static readonly DESKTOP_PIXEL_RATIO_LIMIT = 2;
  static readonly PIXEL_RATIO_STEP = 0.25;
  static readonly SLOW_FRAME_SECONDS = 0.022;
  static readonly SLOW_FRAME_LIMIT = 90;
  static readonly NARROW_ASPECT = 0.9;
  static readonly NARROW_FOV = 52;
  static readonly WIDE_FOV = 42;
  static readonly IDLE_COLOR = 0x141826;

  private readonly renderer: Three<"WebGLRenderer">;
  private readonly quality: QualityGovernorHandle;
  private pixelRatio: number;

  constructor(libs: ThreeLibs, canvas: HTMLCanvasElement, private readonly env: BrowserEnv) {
    const THREE = libs.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !env.touchDevice, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(env.devicePixelRatio(), env.touchDevice ? RenderHost.TOUCH_PIXEL_RATIO_LIMIT : RenderHost.DESKTOP_PIXEL_RATIO_LIMIT);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(RenderHost.IDLE_COLOR);
    this.quality = env.createQualityGovernor({
      steps: [() => this.lowerPixelRatio()],
      slowSec: RenderHost.SLOW_FRAME_SECONDS,
      slowLimit: RenderHost.SLOW_FRAME_LIMIT
    });
    env.onResize(() => this.resize());
    this.resize();
  }

  render(scene: Three<"Scene">, camera: Three<"PerspectiveCamera">): void {
    this.fit(camera);
    this.renderer.render(scene, camera);
  }

  clear(): void {
    this.renderer.clear();
  }

  trackFrameTime(deltaSeconds: number): void {
    this.quality.update(deltaSeconds);
  }

  private resize(): void {
    const size = this.env.viewport();
    this.renderer.setSize(size.width, size.height, false);
  }

  private fit(camera: Three<"PerspectiveCamera">): void {
    const size = this.env.viewport();
    const aspect = size.width / size.height;
    if (camera.aspect === aspect) return;
    camera.aspect = aspect;
    camera.fov = aspect < RenderHost.NARROW_ASPECT ? RenderHost.NARROW_FOV : RenderHost.WIDE_FOV;
    camera.updateProjectionMatrix();
  }

  private lowerPixelRatio(): boolean {
    if (this.pixelRatio <= 1) return false;
    this.pixelRatio = Math.max(1, this.pixelRatio - RenderHost.PIXEL_RATIO_STEP);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
    return true;
  }
}
