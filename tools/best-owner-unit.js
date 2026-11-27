const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "common", "world-record.js"), "utf8");

class FakeStorage {
  constructor() { this.map = new Map(); this.full = false; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { if (this.full) throw new Error("quota"); this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

class FakeServer {
  constructor() { this.rows = {}; }
  fetch(url, options) {
    const [uid, game, key] = url.match(/users\/(.+?)\/personal\/(.+?)\.json/).slice(1).join("/").split("/");
    const table = (this.rows[uid + "/" + game] = this.rows[uid + "/" + game] || {});
    if (options.method === "PUT") table[key] = JSON.parse(options.body);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(table))) });
  }
  raw(uid, game, key) { return this.rows[uid + "/" + game]?.[key]?.raw ?? null; }
}

class FakePage {
  constructor(storage, server, uid) {
    this.reloads = 0;
    const listeners = {};
    const window = {
      PORTAL_CONFIG: { isReady: () => true, DB_URL: "https://db.test" },
      PORTAL_USER: uid ? { uid, getToken: () => Promise.resolve("token") } : null,
    };
    const context = vm.createContext({
      window,
      localStorage: storage,
      fetch: (url, options) => server.fetch(url, options),
      location: { search: "", reload: () => { this.reloads++; } },
      document: { addEventListener: (name, listener) => { listeners[name] = listener; } },
      encodeURIComponent, setTimeout, clearTimeout, setInterval, clearInterval,
    });
    vm.runInContext(SOURCE, context);
    this.api = window.WorldRecord;
  }
  sync(storageKey, companions) {
    const merge = this.api.betterOf((raw) => parseInt(raw, 10), false);
    this.api.syncBest("snakegame", { storageKey, companions, merge });
    return new Promise((resolve) => setTimeout(resolve, 20));
  }
}

class Check {
  constructor() { this.failed = 0; this.total = 0; }
  equal(name, actual, expected) {
    this.total++;
    if (actual === expected) return;
    this.failed++;
    console.log("실패: " + name + " — 기대 " + expected + ", 실제 " + actual);
  }
}

class BestOwnerSuite {
  static async run() {
    const check = new Check();
    const device = new FakeStorage(), server = new FakeServer(), key = "snake_best_v1";

    device.setItem(key, "30");
    device.setItem("snake_progress", "A진행");
    let page = new FakePage(device, server, "a");
    await page.sync(key, ["snake_progress"]);
    check.equal("주인 없는 기록은 첫 로그인 계정이 가진다", server.raw("a", "snakegame", "snakebestv1"), "30");
    check.equal("첫 로그인은 새로고침하지 않는다", page.reloads, 0);

    page = new FakePage(device, server, "b");
    await page.sync(key, ["snake_progress"]);
    check.equal("다른 계정에 앞 계정 기록이 올라가지 않는다", server.raw("b", "snakegame", "snakebestv1"), null);
    check.equal("다른 계정에게 앞 계정 기록이 안 보인다", device.getItem(key), null);
    check.equal("딸린 기록도 안 보인다", device.getItem("snake_progress"), null);
    check.equal("바뀌면 한 번 새로고침한다", page.reloads, 1);

    page = new FakePage(device, server, "b");
    await page.sync(key, ["snake_progress"]);
    check.equal("새로고침 뒤에는 다시 새로고침하지 않는다", page.reloads, 0);
    device.setItem(key, "10");
    await page.sync(key, ["snake_progress"]);
    check.equal("둘째 계정의 새 기록은 둘째 계정에 올라간다", server.raw("b", "snakegame", "snakebestv1"), "10");

    page = new FakePage(device, server, "a");
    await page.sync(key, ["snake_progress"]);
    check.equal("돌아오면 내 기록이 되살아난다", device.getItem(key), "30");
    check.equal("돌아오면 딸린 기록도 되살아난다", device.getItem("snake_progress"), "A진행");
    check.equal("첫 계정 계정 기록은 그대로", server.raw("a", "snakegame", "snakebestv1"), "30");

    page = new FakePage(device, server, null);
    await page.sync(key, ["snake_progress"]);
    check.equal("로그인 없는 화면은 건드리지 않는다", device.getItem(key), "30");
    check.equal("로그인 없는 화면은 새로고침하지 않는다", page.reloads, 0);

    device.full = true;
    page = new FakePage(device, server, "c");
    await page.sync(key, ["snake_progress"]);
    check.equal("보관에 실패하면 계정에 올리지 않는다", server.raw("c", "snakegame", "snakebestv1"), null);
    check.equal("보관에 실패하면 기록을 지우지 않는다", device.getItem(key), "30");
    check.equal("보관에 실패하면 새로고침하지 않는다", page.reloads, 0);

    console.log(check.failed ? check.failed + "/" + check.total + " 실패" : check.total + "개 모두 통과");
    process.exitCode = check.failed ? 1 : 0;
  }
}

BestOwnerSuite.run();
