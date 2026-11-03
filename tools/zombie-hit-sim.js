// 31번 좀비 감염 판정 반경 비교 시뮬레이션: node tools/zombie-hit-sim.js
// 판정은 게임과 같이 "좀비가 한 프레임에 지나간 선분과 인간 중심 사이 거리 < 반경"(distToSegment2D).
// 인간은 도망 방향을 0.4~1.0초마다 바꾸는 무작위 회피(최대 ±70도), 벽에 닿으면 미끄러짐. 좀비는 인간을 곧장 쫓고 7m 안에서 대쉬(10m·0.17초·쿨다운 5초).
// 네트워크 지연: 판정은 인간 기기에서 하므로 좀비 위치가 LAG 초 늦게 보인다.
class Rng {
  constructor(seed) { this.s = seed >>> 0; }
  next() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
}

class Chase {
  static HUMAN = 5.2; static ZOMBIE = 6.0; static DT = 1 / 60; static ARENA = 30;
  static DASH_MS = 0.17; static DASH_DIST = 10; static DASH_CD = 5; static DASH_RANGE = 7;

  constructor(radius, lag, seed, startGap, dash) {
    this.dash = dash; this.r = radius; this.lag = lag; this.rng = new Rng(seed);
    this.h = { x: 0, z: 0 }; this.z = { x: -startGap, z: 0 };
    this.zHist = []; this.heading = 0; this.turnAt = 0; this.dashLeft = 0; this.dashReady = 0; this.dashDir = null;
  }

  static segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }

  run(limit) {
    const dt = Chase.DT; let t = 0;
    const frames = Math.round(this.lag / dt);
    while (t < limit) {
      t += dt;
      this.moveHuman(t, dt);
      const prev = { x: this.z.x, z: this.z.z };
      this.moveZombie(t, dt);
      this.zHist.push([prev, { x: this.z.x, z: this.z.z }]);
      const seen = this.zHist[Math.max(0, this.zHist.length - 1 - frames)];
      if (Chase.segDist(this.h.x, this.h.z, seen[0].x, seen[0].z, seen[1].x, seen[1].z) < this.r) return { caught: true, t, dashed: this.dashLeft > 0 || this.lastDashT > t - 0.3 };
    }
    return { caught: false, t: limit };
  }

  moveHuman(t, dt) {
    const away = Math.atan2(this.h.z - this.z.z, this.h.x - this.z.x);
    if (t >= this.turnAt) { this.heading = away + this.rng.range(-1.2, 1.2); this.turnAt = t + this.rng.range(0.4, 1.0); }
    let nx = this.h.x + Math.cos(this.heading) * Chase.HUMAN * dt, nz = this.h.z + Math.sin(this.heading) * Chase.HUMAN * dt;
    const lim = Chase.ARENA / 2;
    if (Math.abs(nx) > lim) { nx = this.h.x; this.heading = Math.PI - this.heading; }
    if (Math.abs(nz) > lim) { nz = this.h.z; this.heading = -this.heading; }
    this.h.x = nx; this.h.z = nz;
  }

  moveZombie(t, dt) {
    const dx = this.h.x - this.z.x, dz = this.h.z - this.z.z, d = Math.hypot(dx, dz) || 1;
    if (this.dashLeft > 0) {
      const step = Math.min(this.dashLeft, Chase.DASH_DIST * dt / Chase.DASH_MS);
      this.z.x += this.dashDir[0] * step; this.z.z += this.dashDir[1] * step; this.dashLeft -= step; this.lastDashT = t; return;
    }
    if (this.dash && d < Chase.DASH_RANGE && t >= this.dashReady) { this.dashReady = t + Chase.DASH_CD; this.dashLeft = Chase.DASH_DIST; this.dashDir = [dx / d, dz / d]; return; }
    this.z.x += dx / d * Chase.ZOMBIE * dt; this.z.z += dz / d * Chase.ZOMBIE * dt;
  }
}

class Report {
  static trial(radius, lag, n, startGap, limit, dash) {
    const times = []; let caught = 0, byDash = 0;
    for (let i = 0; i < n; i++) {
      const r = new Chase(radius, lag, 7000 + i * 31, startGap, dash).run(limit);
      if (r.caught) { caught++; times.push(r.t); if (r.dashed) byDash++; }
    }
    times.sort((a, b) => a - b);
    const within = (s) => (times.filter((x) => x <= s).length / n * 100).toFixed(0) + "%";
    return { caught: (caught / n * 100).toFixed(0) + "%", med: times.length ? times[Math.floor(times.length / 2)].toFixed(1) : "-", w3: within(3), w6: within(6), w10: within(10), dash: caught ? (byDash / caught * 100).toFixed(0) + "%" : "-" };
  }

  static main() {
    const N = 1500, LIMIT = 30, radii = [1.05, 1.2, 1.365];
    [["감염된 좀비(대쉬 없음)", false], ["숙주 좀비(대쉬 있음)", true]].forEach(([kind, dash]) => {
      [["지연 0.00초", 0], ["지연 0.15초", 0.15]].forEach(([name, lag]) => {
        console.log("== " + kind + " · " + name + " · 시작 거리 6m · " + N + "판 · 최대 " + LIMIT + "초");
        console.log("반경   30초 안 잡힘  중앙값(초)  3초 안  6초 안  10초 안  대쉬로 잡힘");
        radii.forEach((r) => { const x = Report.trial(r, lag, N, 6, LIMIT, dash); console.log(String(r).padEnd(6), x.caught.padStart(8), x.med.padStart(10), x.w3.padStart(8), x.w6.padStart(7), x.w10.padStart(8), x.dash.padStart(10)); });
      });
    });
    console.log("== 대쉬 한 번의 명중률(인간이 대쉬 시작 때 옆으로 피하는 거리 σ, 정규분포)");
    [0.5, 0.8, 1.2].forEach((sigma) => {
      const rng = new Rng(99), row = [1.05, 1.2, 1.365].map((r) => { let hit = 0; for (let i = 0; i < 20000; i++) { const g = Math.sqrt(-2 * Math.log(rng.next() || 1e-9)) * Math.cos(2 * Math.PI * rng.next()); if (Math.abs(g * sigma) < r) hit++; } return (hit / 200).toFixed(0) + "%"; });
      console.log("σ=" + sigma + "m  반경 1.05/1.2/1.365 → " + row.join(" / "));
    });
  }
}

Report.main();
