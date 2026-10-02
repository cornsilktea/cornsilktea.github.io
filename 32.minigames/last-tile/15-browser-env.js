"use strict";
class BrowserEnv {
    constructor(win = window) {
        this.win = win;
        this.touchDevice = "ontouchstart" in win || (navigator.maxTouchPoints || 0) > 0;
    }
    viewport() {
        return { width: this.win.innerWidth, height: this.win.innerHeight };
    }
    devicePixelRatio() {
        return this.win.devicePixelRatio || 1;
    }
    nowMs() {
        return performance.now();
    }
    isPageHidden() {
        return document.hidden;
    }
    onResize(handler) {
        this.win.addEventListener("resize", handler);
    }
    onBlur(handler) {
        this.win.addEventListener("blur", handler);
    }
    onPageHide(handler) {
        this.win.addEventListener("pagehide", handler);
    }
    onKeyDown(handler) {
        this.win.addEventListener("keydown", (event) => handler(this.toKeyPress(event)));
    }
    onKeyUp(handler) {
        this.win.addEventListener("keyup", (event) => handler(this.toKeyPress(event)));
    }
    requestFrame(callback) {
        this.win.requestAnimationFrame(callback);
    }
    everyMs(intervalMs, callback) {
        this.win.setInterval(callback, intervalMs);
    }
    afterMs(delayMs, callback) {
        this.win.setTimeout(callback, delayMs);
    }
    async readJson(url) {
        const response = await this.win.fetch(url);
        return response.ok ? response.json() : null;
    }
    portalConfig() {
        return this.win.PORTAL_CONFIG || null;
    }
    firebaseApi() {
        return this.win.firebase;
    }
    createQualityGovernor(options) {
        const factory = this.win.QualityGovernor;
        if (factory)
            return factory(options);
        return { update: () => undefined, lower: () => false, restore: () => undefined, stepsTaken: 0 };
    }
    toKeyPress(event) {
        const target = event.target;
        const inTextField = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
        return { key: event.key, code: event.code, repeat: event.repeat, inTextField, preventDefault: () => event.preventDefault() };
    }
}
class Page {
    byId(id) {
        return document.getElementById(id);
    }
    show(element, visible) {
        element.hidden = !visible;
    }
    setText(element, text) {
        if (element.textContent !== text)
            element.textContent = text;
    }
    createCanvas(width, height) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    isFocused(element) {
        return document.activeElement === element;
    }
}
