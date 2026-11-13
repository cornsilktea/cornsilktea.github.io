"use strict";
class BbPlayLabAddress {
    static read() {
        const query = new URLSearchParams(location.search), level = query.get("level"), swing = query.get("swing");
        return {
            batsLeft: query.get("bat") === "L", throwsLeft: query.get("arm") === "L",
            seed: Number(query.get("seed") || BbPlayLabAddress.DEFAULT_SEED) || BbPlayLabAddress.DEFAULT_SEED,
            level: level === "easy" || level === "hard" ? level : "normal",
            autoSwingAt: swing === null ? null : (Number(swing) || 0) / 1000, autoPitch: query.has("autopitch"),
            plain: query.has("plain")
        };
    }
}
BbPlayLabAddress.DEFAULT_SEED = 41;
class BbPlayLab {
    constructor(libs) {
        this.options = BbPlayLabAddress.read();
        const controls = document.getElementById("bbControls");
        this.level = BbAiLevel.ALL[this.options.level];
        this.stage = new BbStage(libs, document.getElementById("labView"));
        this.director = new BbMatchDirector(this.stage, new BbScoreHud(document.getElementById("hudTop")), controls, { onEnd: (summary) => this.finish(summary), onLog: () => undefined });
        this.sheet = new BbSheetDialog(controls, () => this.director.preview(this.plan()));
        new BbGameMenu(controls, [{ label: "연출 빠르게", onFlip: (on) => this.director.quicken(on) }], [["연출 건너뛰기", () => this.director.skipScene()], ["나가기", () => location.reload()]]);
        if (this.options.plain)
            document.body.classList.add("plain");
        this.start(controls).catch((error) => this.director.say("불러오지 못했어요", error.message, BbPlayLab.END_TOAST_SECONDS));
    }
    async start(controls) {
        await this.stage.load(BbPlayLab.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, { batsLeft: this.options.batsLeft, throwsLeft: this.options.throwsLeft });
        document.getElementById("labLoading").remove();
        if (this.options.autoPitch || this.options.autoSwingAt !== null)
            this.begin();
        else {
            document.body.classList.add("lobby");
            this.director.preview(this.plan());
            new BbLabLobby(controls, "야구 1대1 대전 · 조작 시험장", () => { document.body.classList.remove("lobby"); this.begin(); }, () => this.sheet.open());
        }
        this.stage.run((frameSeconds) => this.director.tick(frameSeconds));
    }
    plan() {
        const profile = BbProfileStore.load(), batter = profile.lineup[0], pitcher = profile.pitchers[0], options = this.options;
        return {
            format: new BbThreeInningFormat(), names: ["AI " + this.level.label, "나"], seats: ["ai", options.autoPitch ? "ai" : "human"], level: this.level, seed: options.seed,
            halvesToPlay: null, log: [], view: null, autoSwingAt: options.autoSwingAt,
            teams: [
                { lineup: [BbAiLevel.batterSheet("R")], pitchers: [BbAiLevel.pitcherSheet("R")] },
                { lineup: [{ ...batter, hand: options.batsLeft ? "L" : batter.hand }], pitchers: [{ ...pitcher, hand: options.throwsLeft ? "L" : pitcher.hand }] }
            ]
        };
    }
    begin() {
        const plan = this.plan();
        this.director.begin(plan, new BbLocalLink(this.director, plan.seed));
    }
    finish(summary) {
        const score = summary.state.score, mine = score[1], theirs = score[0];
        this.director.say(mine > theirs ? "승리!" : mine < theirs ? "패배" : "무승부", theirs + " : " + mine, BbPlayLab.END_TOAST_SECONDS);
    }
}
BbPlayLab.ASSET_DIRECTORY = "../assets/kaykit/";
BbPlayLab.END_TOAST_SECONDS = 600;
