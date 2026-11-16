"use strict";
class BbLoadGauge {
    constructor() {
        this.startedAt = performance.now();
        this.onRetry = () => undefined;
        this.done = false;
        this.root = BbHudParts.box("bb-load", document.body);
        BbHudParts.box("bb-load-title", this.root, "야구장 준비 중");
        this.text = BbHudParts.box("bb-load-text", this.root);
        const bar = BbHudParts.box("bb-load-bar", this.root);
        this.fill = BbHudParts.box("bb-load-fill", bar);
        this.detail = BbHudParts.box("bb-load-detail", this.root);
        this.retry = document.createElement("button");
        this.retry.type = "button";
        this.retry.className = "bb-load-retry";
        this.retry.textContent = "다시 불러오기";
        this.retry.hidden = true;
        this.retry.addEventListener("click", () => this.pressRetry());
        this.root.appendChild(this.retry);
        window.addEventListener("error", (event) => this.note(event.message || "스크립트 오류"));
        window.addEventListener("unhandledrejection", (event) => this.note(BbLoadGauge.describe(event.reason)));
        this.show("그래픽 라이브러리 받는 중…", 0.02);
    }
    static describe(error) {
        const text = error instanceof Error ? error.message : String(error || "알 수 없는 오류");
        return text.slice(0, BbLoadGauge.DETAIL_LIMIT);
    }
    library() { this.show("그래픽 라이브러리 받는 중…", BbLoadGauge.LIBRARY_AT); }
    files(progress) {
        const slow = performance.now() - this.startedAt > BbLoadGauge.SLOW_MS ? " — 인터넷이 느리면 조금 더 기다려 주세요" : "";
        this.show("선수 파일 받는 중… " + progress.done + " / " + progress.total + slow, BbLoadGauge.FILES_FROM + BbLoadGauge.FILES_SPAN * progress.ratio);
    }
    step(step) {
        this.show(BbLoadGauge.STEP_TEXT[step], BbLoadGauge.STEP_AT[step]);
        return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    fail(message, retry) {
        this.onRetry = retry;
        this.root.classList.add("failed");
        this.text.textContent = message;
        this.retry.hidden = false;
        this.detail.textContent = BbLoadGauge.deviceLine();
    }
    finish() {
        this.done = true;
        this.root.hidden = true;
    }
    contextLost(lost) {
        if (!lost) {
            this.root.hidden = this.done;
            this.root.classList.remove("failed");
            return;
        }
        this.root.hidden = false;
        this.fail("이 기기의 그래픽 메모리가 모자라 3D 화면이 꺼졌어요. 열려 있는 다른 게임 탭을 닫고 다시 불러와 주세요.", () => location.reload());
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
            this.detail.textContent = text.slice(0, BbLoadGauge.DETAIL_LIMIT);
    }
    pressRetry() {
        this.retry.hidden = true;
        this.detail.textContent = "";
        this.onRetry();
    }
    static deviceLine() {
        const agent = navigator.userAgent, browser = /SamsungBrowser\/[\d.]+/.exec(agent) || /Chrome\/\d+/.exec(agent) || /Version\/[\d.]+ Mobile/.exec(agent);
        const model = /;\s*(SM-[A-Z0-9]+)/.exec(agent);
        return [model ? model[1] : "", browser ? browser[0] : ""].filter((part) => !!part).join(" · ");
    }
}
BbLoadGauge.LIBRARY_AT = 0.06;
BbLoadGauge.FILES_FROM = 0.1;
BbLoadGauge.FILES_SPAN = 0.7;
BbLoadGauge.STEP_AT = { park: 0.82, players: 0.92 };
BbLoadGauge.STEP_TEXT = { park: "야구장 만드는 중…", players: "선수 준비하는 중…" };
BbLoadGauge.SLOW_MS = 15000;
BbLoadGauge.DETAIL_LIMIT = 160;
class BbBoot {
    constructor(importer) {
        void this.start(importer, new BbLoadGauge());
    }
    async start(importer, gauge) {
        let libs;
        gauge.library();
        try {
            libs = await BbBoot.within(importer(), BbBoot.LIBRARY_TIMEOUT_MS);
        }
        catch (error) {
            gauge.fail("그래픽 라이브러리(three.js)를 받지 못했어요. 인터넷을 확인하고 다시 불러와 주세요.", () => location.reload());
            return;
        }
        try {
            new BbDuelGame(libs, gauge);
        }
        catch (error) {
            gauge.fail("화면을 준비하지 못했어요: " + BbLoadGauge.describe(error), () => location.reload());
        }
    }
    static within(work, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("시간 초과")), ms);
            work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
        });
    }
}
BbBoot.LIBRARY_TIMEOUT_MS = 30000;
