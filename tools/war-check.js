const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const vm = require("vm");

class GitLocator {
  static find() {
    const attempts = ["git"];
    const desktop = path.join(process.env.LOCALAPPDATA || "", "GitHubDesktop");
    if (fs.existsSync(desktop)) {
      const apps = fs.readdirSync(desktop).filter((name) => name.startsWith("app-")).sort();
      for (const app of apps.reverse()) attempts.push(path.join(desktop, app, "resources", "app", "git", "cmd", "git.exe"));
    }
    for (const candidate of attempts) {
      const probe = childProcess.spawnSync(candidate, ["--version"]);
      if (probe.status === 0) return candidate;
    }
    throw new Error("git 을 찾지 못했어요");
  }

  static run(args, cwd) {
    const result = childProcess.spawnSync(GitLocator.find(), args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) throw new Error("git " + args.join(" ") + " 실패: " + result.stderr);
    return result.stdout;
  }
}

class WarCheckReport {
  constructor() {
    this.failures = [];
    this.passes = [];
  }

  pass(label) {
    this.passes.push(label);
    console.log("통과  " + label);
  }

  fail(label, details) {
    this.failures.push(label);
    console.log("실패  " + label);
    for (const line of details.slice(0, 12)) console.log("      " + line);
    if (details.length > 12) console.log("      … 외 " + (details.length - 12) + "건");
  }

  record(label, problems) {
    if (problems.length === 0) this.pass(label);
    else this.fail(label, problems);
  }
}

class CompileCheck {
  run(root) {
    const result = childProcess.spawnSync("npx", ["tsc", "-p", "."], { cwd: root, encoding: "utf8", shell: true });
    return result.status === 0 ? [] : (result.stdout + result.stderr).split("\n").filter((line) => line.trim() !== "");
  }
}

class SimCheck {
  run(root) {
    const result = childProcess.spawnSync("node", [path.join(".claude", "war-sim.js")], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const output = result.stdout + result.stderr;
    const problems = output.split("\n").filter((line) => line.startsWith("FAIL"));
    if (!output.includes("ALL PASS")) problems.push("규칙 검사가 'ALL PASS' 로 끝나지 않았어요 (종료 코드 " + result.status + ")");
    return problems;
  }
}

class EncodingCheck {
  static TEXT_EXTENSIONS = new Set([".md", ".js", ".ts", ".html", ".json", ".css", ".txt", ".ps1"]);

  run(root) {
    const problems = [];
    const files = GitLocator.run(["ls-files", "-z"], root).split("\0").filter((name) => name !== "");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (const name of files) {
      if (!EncodingCheck.TEXT_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
      const full = path.join(root, name);
      if (!fs.existsSync(full)) continue;
      const bytes = fs.readFileSync(full);
      let text;
      try {
        text = decoder.decode(bytes);
      } catch (error) {
        problems.push(name + ": UTF-8 이 아닌 글자가 섞여 있어요");
        continue;
      }
      if (text.includes(String.fromCharCode(0xFFFD))) problems.push(name + ": 깨진 글자(U+FFFD)가 있어요");
      if (text.indexOf(String.fromCharCode(0xFEFF), 1) > 0) problems.push(name + ": 파일 중간에 BOM 이 끼어 있어요");
    }
    return problems;
  }
}

class AssetCheck {
  static SOURCES = ["ts/37.war-views.ts", "ts/37.war-scenery.ts", "ts/37.war-hud.ts", "ts/37.space-war.ts"];
  static ROOT = "assets/kaykit/war";
  static RIG_ANIMATIONS = ["General", "MovementBasic", "CombatMelee", "CombatRanged"];

  run(root) {
    const problems = [];
    const wanted = new Set(AssetCheck.RIG_ANIMATIONS.map((name) => "animations/Rig_Medium_" + name + ".glb"));
    for (const source of AssetCheck.SOURCES) {
      const text = fs.readFileSync(path.join(root, source), "utf8");
      for (const match of text.matchAll(/"([A-Za-z0-9_\-./]+\.(?:gltf|glb))"/g)) wanted.add(match[1]);
    }
    for (const file of wanted) {
      const full = path.join(root, AssetCheck.ROOT, file);
      if (!fs.existsSync(full)) {
        problems.push(file + ": 파일이 없어요");
        continue;
      }
      if (file.endsWith(".gltf")) this.checkDependencies(full, file, problems);
    }
    return problems;
  }

  checkDependencies(full, file, problems) {
    const json = JSON.parse(fs.readFileSync(full, "utf8"));
    const uris = [...(json.buffers || []), ...(json.images || [])].map((entry) => entry.uri).filter((uri) => uri && !uri.startsWith("data:"));
    for (const uri of uris) {
      if (!fs.existsSync(path.join(path.dirname(full), decodeURIComponent(uri)))) problems.push(file + ": 딸린 파일 " + uri + " 이 없어요");
    }
  }
}

class BalanceTextCheck {
  run(root) {
    const problems = [];
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, "37.war-data.js"), "utf8") + "\nthis.WarBalance = WarBalance;", sandbox);
    const html = fs.readFileSync(path.join(root, "37.space-war.html"), "utf8");
    for (const match of html.matchAll(/data-balance="([A-Z_]+)"/g)) {
      if (match[1] !== "MATCH_MINUTES" && typeof sandbox.WarBalance[match[1]] !== "number") problems.push("37.space-war.html: data-balance=" + match[1] + " 에 맞는 수치가 없어요");
    }
    return problems;
  }
}

class ScriptVersionCheck {
  run(root) {
    const html = fs.readFileSync(path.join(root, "37.space-war.html"), "utf8");
    const versions = new Set([...html.matchAll(/src="37\.[a-z\-]+\.js\?v=([A-Za-z0-9]+)"/g)].map((match) => match[1]));
    const count = [...html.matchAll(/src="37\.[a-z\-]+\.js/g)].length;
    const withVersion = [...html.matchAll(/src="37\.[a-z\-]+\.js\?v=/g)].length;
    const problems = [];
    if (versions.size !== 1) problems.push("37번 스크립트의 버전 값이 서로 달라요: " + [...versions].join(", "));
    if (count !== withVersion) problems.push("버전 값이 없는 37번 스크립트가 있어요");
    return problems;
  }
}

class WarCheckRunner {
  constructor(root) {
    this.root = root;
    this.report = new WarCheckReport();
  }

  run() {
    this.report.record("컴파일(tsc)", new CompileCheck().run(this.root));
    this.report.record("규칙 검사(war-sim)", new SimCheck().run(this.root));
    this.report.record("글자 깨짐·BOM 검사", new EncodingCheck().run(this.root));
    this.report.record("모델·질감 파일 존재", new AssetCheck().run(this.root));
    this.report.record("안내 문구 수치 연결", new BalanceTextCheck().run(this.root));
    this.report.record("스크립트 버전 값", new ScriptVersionCheck().run(this.root));
    console.log(this.report.failures.length === 0 ? "\n모두 통과했어요. 푸시해도 돼요." : "\n실패 " + this.report.failures.length + "건 — 고친 뒤 푸시하세요.");
    process.exit(this.report.failures.length === 0 ? 0 : 1);
  }
}

new WarCheckRunner(path.resolve(__dirname, "..")).run();
