"use strict";
class ClimbLoadGauge {
    constructor() {
        this.startedAt = performance.now();
        this.done = false;
        this.root = ClimbLoadGauge.box("climb-load", document.body);
        ClimbLoadGauge.box("climb-load-title", this.root, "타워 준비 중");
        this.text = ClimbLoadGauge.box("climb-load-text", this.root);
        const bar = ClimbLoadGauge.box("climb-load-bar", this.root);
        this.fill = ClimbLoadGauge.box("climb-load-fill", bar);
        this.detail = ClimbLoadGauge.box("climb-load-detail", this.root);
        this.retry = document.createElement("button");
        this.retry.type = "button";
        this.retry.className = "climb-load-retry";
        this.retry.textContent = "다시 불러오기";
        this.retry.hidden = true;
        this.retry.addEventListener("click", () => location.reload());
        this.root.appendChild(this.retry);
        window.addEventListener("error", (event) => this.note(event.message || "스크립트 오류"));
        window.addEventListener("unhandledrejection", (event) => this.note(ClimbLoadGauge.describe(event.reason)));
        this.show("그래픽 라이브러리 받는 중…", 0.02);
    }
    static describe(error) {
        const text = error instanceof Error ? error.message : String(error || "알 수 없는 오류");
        return text.slice(0, ClimbLoadGauge.DETAIL_LIMIT);
    }
    library() { this.show("그래픽 라이브러리 받는 중…", ClimbLoadGauge.LIBRARY_AT); }
    characters(progress) {
        this.show("캐릭터 파일 받는 중… " + progress.done + " / " + progress.total + this.slowNote(), ClimbLoadGauge.CHARACTERS_FROM + ClimbLoadGauge.CHARACTERS_SPAN * progress.ratio);
    }
    models(progress) {
        this.show("탑 블록·소품 받는 중… " + progress.done + " / " + progress.total + this.slowNote(), ClimbLoadGauge.MODELS_FROM + ClimbLoadGauge.MODELS_SPAN * progress.ratio);
    }
    step(step) {
        this.show(ClimbLoadGauge.STEP_TEXT[step], ClimbLoadGauge.STEP_AT[step]);
        return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    fail(message) {
        this.root.hidden = false;
        this.root.classList.add("failed");
        this.text.textContent = message;
        this.retry.hidden = false;
        if (!this.detail.textContent)
            this.detail.textContent = ClimbLoadGauge.deviceLine();
    }
    finish() {
        this.done = true;
        this.root.hidden = true;
    }
    slowNote() {
        return performance.now() - this.startedAt > ClimbLoadGauge.SLOW_MS ? " — 인터넷이 느리면 조금 더 기다려 주세요" : "";
    }
    show(text, ratio) {
        if (this.done)
            return;
        this.root.hidden = false;
        this.root.classList.remove("failed");
        this.retry.hidden = true;
        this.text.textContent = text;
        this.fill.style.transform = "scaleX(" + Math.max(0, Math.min(1, ratio)).toFixed(3) + ")";
    }
    note(text) {
        if (!this.done)
            this.detail.textContent = text.slice(0, ClimbLoadGauge.DETAIL_LIMIT);
    }
    static box(className, parent, text = "") {
        const element = document.createElement("div");
        element.className = className;
        element.textContent = text;
        parent.appendChild(element);
        return element;
    }
    static deviceLine() {
        const agent = navigator.userAgent, browser = /SamsungBrowser\/[\d.]+/.exec(agent) || /Chrome\/\d+/.exec(agent) || /Version\/[\d.]+ Mobile/.exec(agent);
        const model = /;\s*(SM-[A-Z0-9]+)/.exec(agent);
        return [model ? model[1] : "", browser ? browser[0] : ""].filter((part) => !!part).join(" · ");
    }
}
ClimbLoadGauge.LIBRARY_AT = 0.06;
ClimbLoadGauge.CHARACTERS_FROM = 0.1;
ClimbLoadGauge.CHARACTERS_SPAN = 0.3;
ClimbLoadGauge.MODELS_FROM = 0.4;
ClimbLoadGauge.MODELS_SPAN = 0.45;
ClimbLoadGauge.STEP_AT = { tower: 0.9, ready: 0.97 };
ClimbLoadGauge.STEP_TEXT = { tower: "탑 쌓는 중…", ready: "캐릭터 준비하는 중…" };
ClimbLoadGauge.SLOW_MS = 15000;
ClimbLoadGauge.DETAIL_LIMIT = 160;
class ClimbBoot {
    constructor(importer) {
        void this.start(importer, new ClimbLoadGauge());
    }
    async start(importer, gauge) {
        let libs;
        gauge.library();
        try {
            libs = await ClimbBoot.within(importer(), ClimbBoot.LIBRARY_TIMEOUT_MS);
        }
        catch (error) {
            gauge.fail("그래픽 라이브러리(three.js)를 받지 못했어요. 인터넷을 확인하고 다시 불러와 주세요.");
            return;
        }
        try {
            new TowerClimbGame(libs, gauge);
        }
        catch (error) {
            gauge.fail("화면을 준비하지 못했어요: " + ClimbLoadGauge.describe(error));
        }
    }
    static within(work, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("시간 초과")), ms);
            work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
        });
    }
}
ClimbBoot.LIBRARY_TIMEOUT_MS = 30000;
