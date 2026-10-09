const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

class DeployCheck {
  static REPO = "cornsilktea/cornsilktea.github.io";
  static SITE = "https://cornsilktea.github.io/";
  static WAIT_MS = 8 * 60 * 1000;
  static POLL_MS = 15 * 1000;
  static FILES = ["37.space-war.html", "37.war-data.js", "37.war-rules.js", "37.war-views.js", "37.war-hud.js", "37.space-war.js"];

  constructor(root) {
    this.root = root;
  }

  headSha() {
    return childProcess.execFileSync(this.gitPath(), ["rev-parse", "HEAD"], { cwd: this.root, encoding: "utf8" }).trim();
  }

  gitPath() {
    const desktop = path.join(process.env.LOCALAPPDATA || "", "GitHubDesktop");
    if (fs.existsSync(desktop)) {
      const apps = fs.readdirSync(desktop).filter((name) => name.startsWith("app-")).sort().reverse();
      for (const app of apps) {
        const candidate = path.join(desktop, app, "resources", "app", "git", "cmd", "git.exe");
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return "git";
  }

  async waitForBuild(sha) {
    const started = Date.now();
    while (Date.now() - started < DeployCheck.WAIT_MS) {
      const response = await fetch("https://api.github.com/repos/" + DeployCheck.REPO + "/actions/runs?per_page=10", { headers: { "User-Agent": "war-deploy-check" } });
      const body = await response.json();
      const run = (body.workflow_runs || []).find((item) => item.head_sha === sha);
      if (run && run.status === "completed") return run.conclusion;
      console.log("빌드 기다리는 중… " + (run ? run.status : "아직 시작 전"));
      await new Promise((resolve) => setTimeout(resolve, DeployCheck.POLL_MS));
    }
    return "timeout";
  }

  async compareLive() {
    const problems = [];
    for (const name of DeployCheck.FILES) {
      const local = fs.readFileSync(path.join(this.root, name), "utf8").replace(/\r\n/g, "\n");
      const response = await fetch(DeployCheck.SITE + name + "?nocache=" + Date.now(), { cache: "no-store" });
      const live = (await response.text()).replace(/\r\n/g, "\n");
      if (live !== local) problems.push(name + ": 사이트의 파일이 내 컴퓨터와 달라요");
    }
    return problems;
  }

  async run() {
    const sha = this.headSha();
    console.log("확인할 커밋 " + sha.slice(0, 7));
    const conclusion = await this.waitForBuild(sha);
    if (conclusion !== "success") {
      console.log("실패  Pages 빌드 결과: " + conclusion);
      process.exit(1);
    }
    const problems = await this.compareLive();
    if (problems.length > 0) {
      console.log("실패  배포는 끝났지만 사이트 내용이 달라요 (캐시일 수 있으니 잠시 뒤 다시):");
      for (const line of problems) console.log("      " + line);
      process.exit(1);
    }
    console.log("통과  빌드 성공, 사이트 파일이 내 컴퓨터와 같아요.");
  }
}

new DeployCheck(path.resolve(__dirname, "..")).run();
