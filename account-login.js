"use strict";
/* =====================================================================
   학생 구글 로그인 (공용 모듈)

   반별 링크(?c=1-1 …)와 대회서버(?c=contest)로 들어오면 자료가 실행되기 전에 구글 로그인을 요구한다.
   배포용(?c=test)·학생배포용(?c=student)·?c= 없는 링크는 지금처럼 로그인 없이 열린다.
   access-guard.js 가 이 파일을 불러오고(index.html·contest.html 은 script 한 줄로 직접), 로그인이 끝나야 잠금 확인을 이어 간다.

   로그인하면
     window.PORTAL_USER = { uid, email, name, getToken() }   (로그아웃 전·로그인 전에는 null/없음)
     document 에 "portal-user-changed" 이벤트
   를 가드가 PORTAL_CLASS 를 만들어 주는 것처럼 제공한다. getToken() 은 데이터베이스 REST 요청의 ?auth= 에 붙일 ID 토큰이다.
   로그인 정보는 SDK 가 기기에 보관하므로 한 번 로그인하면 다음부터는 화면이 바로 열린다.

   학교 계정만 받는다: 이메일이 @dongma.sen.ms.kr 이고 구글이 확인한(email_verified) 계정.
   로그인 창의 hd 는 계정 고르기 힌트일 뿐이므로, 진짜 막는 곳은 데이터베이스규칙.json 의 users 규칙이다.
   ===================================================================== */
class AccountPolicy {
    static requiresLogin(search) {
        return AccountPolicy.LOGIN_CLASS_PATTERN.test(search);
    }
    static accepts(user) {
        if (AccountPolicy.ADMIN_UIDS.indexOf(user.uid) >= 0)
            return true;
        const email = (user.email || "").toLowerCase();
        return user.emailVerified && email.endsWith("@" + AccountPolicy.DOMAIN);
    }
    static displayName(user) {
        const raw = user.displayName || (user.email || "").split("@")[0] || "학생";
        return raw.replace(/[\u0000-\u001f<>]/g, "").trim() || "학생";
    }
}
AccountPolicy.DOMAIN = "dongma.sen.ms.kr";
AccountPolicy.ADMIN_UIDS = ["use16pcii5RbEATuPtWhRDArmoj2", "HFcjiyXAl1YWzm3AyrZmzo4uMdG3"];
AccountPolicy.LOGIN_CLASS_PATTERN = /[?&]c=(?:[12]-[1-5]|contest)(?:&|$)/;
class AccountAuthClient {
    constructor() {
        this.sdk = null;
        this.auth = null;
    }
    async prepare() {
        const config = window.PORTAL_CONFIG;
        if (!config || !config.isReady() || config.API_KEY.indexOf("여기에") >= 0) {
            throw new Error("config");
        }
        const appUrl = AccountAuthClient.SDK_DIRECTORY + "firebase-app.js";
        const authUrl = AccountAuthClient.SDK_DIRECTORY + "firebase-auth.js";
        const appModule = (await import(appUrl));
        const authModule = (await import(authUrl));
        this.sdk = { ...authModule, initializeApp: appModule.initializeApp };
        const app = this.sdk.initializeApp({ apiKey: config.API_KEY, authDomain: config.AUTH_DOMAIN }, AccountAuthClient.APP_NAME);
        this.auth = this.sdk.getAuth(app);
    }
    watch(listener) {
        this.requireSdk().onAuthStateChanged(this.auth, listener);
    }
    async signIn() {
        const sdk = this.requireSdk();
        const provider = new sdk.GoogleAuthProvider();
        provider.setCustomParameters({ hd: AccountPolicy.DOMAIN, prompt: "select_account" });
        try {
            await sdk.signInWithPopup(this.auth, provider);
        }
        catch (error) {
            const code = error.code || "";
            const popupUnavailable = code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment";
            if (!popupUnavailable)
                throw error;
            await sdk.signInWithRedirect(this.auth, provider);
        }
    }
    signOut() {
        return this.requireSdk().signOut(this.auth);
    }
    requireSdk() {
        if (!this.sdk)
            throw new Error("sdk");
        return this.sdk;
    }
}
AccountAuthClient.SDK_DIRECTORY = "https://www.gstatic.com/firebasejs/10.12.0/";
AccountAuthClient.APP_NAME = "portal-account";
class AccountLoginScreen {
    constructor(onLoginClick) {
        this.overlay = document.createElement("div");
        this.title = document.createElement("p");
        this.description = document.createElement("p");
        this.button = document.createElement("button");
        this.message = document.createElement("p");
        this.overlay.setAttribute("data-account-login", "1");
        this.overlay.style.cssText = [
            "position:fixed", "top:0", "right:0", "bottom:0", "left:0", "z-index:2147483000",
            "display:flex", "align-items:center", "justify-content:center", "padding:24px",
            "background:#F4F6F1", "color:#1B2B20", "text-align:center", "visibility:visible",
            "font-family:" + AccountLoginScreen.FONT
        ].join(";");
        const box = document.createElement("div");
        box.style.cssText = "background:#fff;border:1px solid #C9D2C3;border-radius:4px;padding:28px 24px;max-width:360px;width:100%;box-sizing:border-box";
        this.title.style.cssText = "font-size:18px;font-weight:700;margin:0 0 8px";
        this.description.style.cssText = "font-size:14px;color:#5B6B5E;margin:0 0 18px;line-height:1.6";
        this.button.type = "button";
        this.button.style.cssText = "width:100%;height:46px;font:inherit;font-size:15px;font-weight:700;border-radius:4px;cursor:pointer;" +
            "border:1px solid #24402F;background:#24402F;color:#fff";
        this.button.addEventListener("click", onLoginClick);
        this.message.style.cssText = "font-size:13px;color:#B33951;font-weight:700;margin:12px 0 0;line-height:1.5;min-height:18px";
        [this.title, this.description, this.button, this.message].forEach((part) => box.appendChild(part));
        this.overlay.appendChild(box);
    }
    showLoading() {
        this.paint("로그인 준비 중", "잠시만 기다려 주세요.", "");
        this.button.style.display = "none";
        this.message.textContent = "";
    }
    showLogin(message) {
        this.paint("수업 자료 로그인", "학교 구글 계정(@" + AccountPolicy.DOMAIN + ")으로 로그인해 주세요.", "Google 계정으로 로그인");
        this.button.style.display = "block";
        this.button.disabled = false;
        this.message.textContent = message;
    }
    showError(message) {
        this.paint("로그인을 시작하지 못했어요", "인터넷 연결을 확인하고 다시 열어 주세요.", "");
        this.button.style.display = "none";
        this.message.textContent = message;
    }
    disableButton() {
        this.button.disabled = true;
    }
    hide() {
        this.overlay.remove();
    }
    paint(title, description, buttonText) {
        this.title.textContent = title;
        this.description.textContent = description;
        this.button.textContent = buttonText;
        if (!this.overlay.isConnected)
            document.documentElement.appendChild(this.overlay);
    }
}
AccountLoginScreen.FONT = "'Nanum Gothic','Malgun Gothic','맑은 고딕',sans-serif";
class AccountChip {
    constructor(onClick) {
        this.chip = document.createElement("button");
        this.chip.type = "button";
        this.chip.setAttribute("data-account-chip", "1");
        this.chip.style.cssText = [
            "position:fixed", "top:calc(8px + env(safe-area-inset-top, 0px))", "right:10px", "z-index:2147482000",
            "height:32px", "max-width:60vw", "padding:0 12px", "box-sizing:border-box", "border-radius:6px",
            "font-size:13px", "font-weight:600", "line-height:1", "cursor:pointer", "white-space:nowrap",
            "overflow:hidden", "text-overflow:ellipsis",
            "border:1px solid rgba(255,255,255,0.18)", "background:rgba(0,0,0,0.45)", "color:rgba(255,255,255,0.9)",
            "font-family:'Nanum Gothic','Malgun Gothic','맑은 고딕',sans-serif"
        ].join(";");
        this.chip.addEventListener("click", onClick);
    }
    show(name) {
        this.chip.textContent = name + " · 로그아웃";
        if (!this.chip.isConnected)
            document.body.appendChild(this.chip);
    }
}
class AccountNickWriter {
    write(name) {
        try {
            const stored = localStorage.getItem(AccountNickWriter.STORAGE_KEY);
            const data = (stored ? JSON.parse(stored) : {});
            if (data.nick === name)
                return;
            data.nick = name;
            localStorage.setItem(AccountNickWriter.STORAGE_KEY, JSON.stringify(data));
        }
        catch (error) {
            return;
        }
        document.dispatchEvent(new CustomEvent(AccountNickWriter.CHANGE_EVENT));
        document.dispatchEvent(new CustomEvent(AccountNickWriter.SETTLED_EVENT));
    }
}
AccountNickWriter.STORAGE_KEY = "portal_profile_v1";
AccountNickWriter.CHANGE_EVENT = "portal-profile-changed";
AccountNickWriter.SETTLED_EVENT = "portal-profile-settled";
class AccountGate {
    constructor() {
        this.client = new AccountAuthClient();
        this.screen = new AccountLoginScreen(() => this.requestSignIn());
        this.chip = new AccountChip(() => this.requestSignOut());
        this.nickWriter = new AccountNickWriter();
        this.hideStyle = document.createElement("style");
        this.nickSettingStyle = document.createElement("style");
        this.published = false;
    }
    start() {
        const isWebPage = location.protocol === "http:" || location.protocol === "https:";
        if (!isWebPage || !AccountPolicy.requiresLogin(location.search))
            return;
        this.hideStyle.textContent = "body{visibility:hidden !important}";
        (document.head || document.documentElement).appendChild(this.hideStyle);
        this.whenDocumentReady(() => this.begin());
    }
    begin() {
        this.screen.showLoading();
        this.client.prepare()
            .then(() => this.client.watch((user) => this.onUser(user)))
            .catch(() => this.screen.showError("로그인 도구를 불러오지 못했습니다."));
    }
    onUser(user) {
        if (!user) {
            this.screen.showLogin("");
            return;
        }
        if (!AccountPolicy.accepts(user)) {
            this.client.signOut().then(() => {
                this.screen.showLogin("학교 계정(@" + AccountPolicy.DOMAIN + ")으로만 로그인할 수 있어요.");
            });
            return;
        }
        this.publish(user);
    }
    publish(user) {
        const name = AccountPolicy.displayName(user);
        window.PORTAL_USER = { uid: user.uid, email: user.email || "", name, getToken: () => user.getIdToken() };
        this.nickWriter.write(name);
        this.hideNickSettingButtons();
        this.screen.hide();
        this.hideStyle.remove();
        this.chip.show(name);
        if (!this.published)
            this.loadRecordsModule();
        this.published = true;
        document.dispatchEvent(new CustomEvent(AccountGate.USER_EVENT));
    }
    hideNickSettingButtons() {
        this.nickSettingStyle.textContent = "[data-nick-setting]{display:none !important}";
        if (!this.nickSettingStyle.isConnected)
            document.head.appendChild(this.nickSettingStyle);
    }
    requestSignIn() {
        this.screen.disableButton();
        this.client.signIn().catch((error) => {
            const code = error.code || "";
            const closedByUser = code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
            this.screen.showLogin(closedByUser ? "" : "로그인하지 못했어요. 다시 눌러 주세요.");
        });
    }
    requestSignOut() {
        this.client.signOut().then(() => location.reload());
    }
    loadRecordsModule() {
        const current = document.querySelector("script[src*='account-login.js']");
        const script = document.createElement("script");
        script.charset = "utf-8";
        script.src = current ? current.src.replace("account-login.js", AccountGate.RECORDS_SCRIPT) : AccountGate.RECORDS_SCRIPT;
        document.head.appendChild(script);
    }
    whenDocumentReady(action) {
        if (document.readyState === "loading")
            document.addEventListener("DOMContentLoaded", action);
        else
            action();
    }
}
AccountGate.USER_EVENT = "portal-user-changed";
AccountGate.RECORDS_SCRIPT = "personal-records.js";
new AccountGate().start();
