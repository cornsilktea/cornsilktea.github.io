"use strict";
class RenderHost {
    constructor(libs, canvas, env) {
        this.env = env;
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
    render(scene, camera) {
        this.fit(camera);
        this.renderer.render(scene, camera);
    }
    clear() {
        this.renderer.clear();
    }
    trackFrameTime(deltaSeconds) {
        this.quality.update(deltaSeconds);
    }
    resize() {
        const size = this.env.viewport();
        this.renderer.setSize(size.width, size.height, false);
    }
    fit(camera) {
        const size = this.env.viewport();
        const aspect = size.width / size.height;
        if (camera.aspect === aspect)
            return;
        camera.aspect = aspect;
        camera.fov = aspect < RenderHost.NARROW_ASPECT ? RenderHost.NARROW_FOV : RenderHost.WIDE_FOV;
        camera.updateProjectionMatrix();
    }
    lowerPixelRatio() {
        if (this.pixelRatio <= 1)
            return false;
        this.pixelRatio = Math.max(1, this.pixelRatio - RenderHost.PIXEL_RATIO_STEP);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
        return true;
    }
}
RenderHost.TOUCH_PIXEL_RATIO_LIMIT = 1.5;
RenderHost.DESKTOP_PIXEL_RATIO_LIMIT = 2;
RenderHost.PIXEL_RATIO_STEP = 0.25;
RenderHost.SLOW_FRAME_SECONDS = 0.022;
RenderHost.SLOW_FRAME_LIMIT = 90;
RenderHost.NARROW_ASPECT = 0.9;
RenderHost.NARROW_FOV = 52;
RenderHost.WIDE_FOV = 42;
RenderHost.IDLE_COLOR = 0x141826;
