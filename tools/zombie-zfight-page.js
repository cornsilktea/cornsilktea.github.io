// 31번 좀비 아웃브레이크의 겹친 면(z-fighting) 검사 화면을 만든다.
// 사용: node tools/zombie-zfight-page.js [원본.html] [결과.html]  →  기본은 31번 원본으로 .claude/zombie-zfight.html 생성
// 카메라는 콘솔에서 window.__cam = { from: [x, y, z], to: [x, y, z] } 로 고정한다(빼면 원래 둘러보기).
// 브라우저(정적 서버)에서 열면 학교를 다 지은 뒤 window.__zfReport 에 결과가 들어간다.
// 같은 방향을 보는 두 면이 TOL 이내 거리에 있고 넓이가 MIN_AREA 이상 겹치면 보고한다.
// (완전히 가려진 같은 평면의 면은 게임의 CoplanarFaceCuller 가 이미 지우므로 지운 뒤의 면만 본다.)
"use strict";
const fs = require("fs");
const path = require("path");

class ZombieZFightPage {
  static ROOT = path.join(__dirname, "..");
  static SOURCE = "31.zombie-outbreak.html";
  static OUTPUT = path.join(".claude", "zombie-zfight.html");
  static HOOK_FROM = "for (const f of CoplanarFaceCuller.cull(faces)) {";
  static HOOK_TO = "window.__zfCullMs = performance.now(); window.__zfKept = CoplanarFaceCuller.cull(faces); window.__zfCullMs = performance.now() - window.__zfCullMs; window.__zfBuiltAt = performance.now(); for (const f of window.__zfKept) {";
  static CAMERA_FROM = "    updateTour(nowMs);";
  static CAMERA_TO = "    if (window.__cam) { setViewDistance(...(window.__cam.view || [4, 34, 60])); camera.position.fromArray(window.__cam.from); camera.lookAt(...window.__cam.to); show($(\"tourOverlay\"), false); show($(\"tourCaption\"), false); $(\"tourFade\").style.opacity = 0; } else updateTour(nowMs);";

  constructor(source, output) {
    this.source = source || ZombieZFightPage.SOURCE;
    this.output = output || ZombieZFightPage.OUTPUT;
  }

  build() {
    let html = fs.readFileSync(path.join(ZombieZFightPage.ROOT, this.source), "utf8");
    if (!html.includes(ZombieZFightPage.HOOK_FROM)) throw new Error("훅 자리를 찾지 못함: " + ZombieZFightPage.HOOK_FROM);
    html = html.replace(ZombieZFightPage.HOOK_FROM, ZombieZFightPage.HOOK_TO);
    if (!html.includes(ZombieZFightPage.CAMERA_FROM)) throw new Error("카메라 훅 자리를 찾지 못함");
    html = html.replace(ZombieZFightPage.CAMERA_FROM, ZombieZFightPage.CAMERA_TO);
    html = html.replace('<script charset="utf-8" src="common/access-guard.js" data-game="zombieoutbreak"></script>', "");
    html = html.replace("<head>", '<head>\n<base href="../">\n<script src="tools/fbmock.js"></script>\n<script>firebase.apps = [];</script>');
    html = html.replace("</body>", "<script>\n" + ZombieZFightPage.detectorSource() + "\n</script>\n</body>");
    fs.writeFileSync(path.join(ZombieZFightPage.ROOT, this.output), html, "utf8");
    console.log("만듦: " + this.output);
  }

  static detectorSource() {
    return "(" + function () {
      class ZFightDetector {
        static TOL = 0.001;
        static MIN_AREA = 0.0004;
        static CELL = 2;

        constructor(faces) { this.faces = faces; }

        static normalOf(p) {
          const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
          const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          let n = cross(sub(p[1], p[0]), sub(p[3], p[0]));
          if (Math.hypot(...n) < 1e-9) n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
          const l = Math.hypot(...n);
          return l < 1e-9 ? null : n.map(v => v / l);
        }

        static basisOf(n) {
          const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
          const u = [ref[1] * n[2] - ref[2] * n[1], ref[2] * n[0] - ref[0] * n[2], ref[0] * n[1] - ref[1] * n[0]];
          const ul = Math.hypot(...u);
          const uu = u.map(v => v / ul);
          return [uu, [n[1] * uu[2] - n[2] * uu[1], n[2] * uu[0] - n[0] * uu[2], n[0] * uu[1] - n[1] * uu[0]]];
        }

        static polygonArea(poly) {
          let a = 0;
          for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
          return a / 2;
        }

        static clip(subject, clipper) {
          let out = subject;
          const ccw = ZFightDetector.polygonArea(clipper) > 0 ? 1 : -1;
          for (let i = 0; i < clipper.length && out.length; i++) {
            const a = clipper[i], b = clipper[(i + 1) % clipper.length];
            const side = p => ccw * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
            const input = out; out = [];
            for (let j = 0; j < input.length; j++) {
              const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q);
              if (sp >= 0) out.push(p);
              if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
            }
          }
          return out;
        }

        static dedupe(poly) {
          return poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.abs(p[0] - q[0]) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7; });
        }

        prepare() {
          const groups = new Map();
          this.faces.forEach((f, index) => {
            if (f.m === "glass") return;
            const n = ZFightDetector.normalOf(f.p);
            if (!n) return;
            const nKey = n.map(v => Math.round(v * 200)).join(",");
            let g = groups.get(nKey);
            if (!g) groups.set(nKey, g = { n, basis: ZFightDetector.basisOf(n), items: [] });
            const [u, v] = g.basis;
            const poly = ZFightDetector.dedupe(f.p.map(p => [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2]]));
            if (poly.length < 3 || Math.abs(ZFightDetector.polygonArea(poly)) < 1e-7) return;
            const d = f.p[0][0] * g.n[0] + f.p[0][1] * g.n[1] + f.p[0][2] * g.n[2];
            const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
            g.items.push({ index, f, d, poly, box: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] });
          });
          return groups;
        }

        run() {
          const found = [], tol = ZFightDetector.TOL, cell = ZFightDetector.CELL;
          for (const [, g] of this.prepare()) {
            const grid = new Map();
            for (const it of g.items) {
              const dk = Math.floor(it.d / tol);
              for (let i = Math.floor(it.box[0] / cell); i <= Math.floor(it.box[1] / cell); i++)
                for (let j = Math.floor(it.box[2] / cell); j <= Math.floor(it.box[3] / cell); j++) {
                  const key = dk + "|" + i + "|" + j;
                  if (!grid.has(key)) grid.set(key, []);
                  grid.get(key).push(it);
                }
            }
            const seen = new Set();
            for (const [key, list] of grid) {
              const [dk, i, j] = key.split("|").map(Number);
              const near = list.concat(grid.get((dk + 1) + "|" + i + "|" + j) || []);
              for (let a = 0; a < list.length; a++) for (let b = 0; b < near.length; b++) {
                const A = list[a], B = near[b];
                if (A === B || (b < list.length && b <= a)) continue;
                const pairKey = Math.min(A.index, B.index) + ":" + Math.max(A.index, B.index);
                if (seen.has(pairKey)) continue;
                seen.add(pairKey);
                if (Math.abs(A.d - B.d) > tol) continue;
                if (A.box[1] < B.box[0] || B.box[1] < A.box[0] || A.box[3] < B.box[2] || B.box[3] < A.box[2]) continue;
                const area = Math.abs(ZFightDetector.polygonArea(ZFightDetector.clip(A.poly, B.poly)));
                if (area < ZFightDetector.MIN_AREA) continue;
                const colorGap = Math.abs(A.f.col[0] - B.f.col[0]) + Math.abs(A.f.col[1] - B.f.col[1]) + Math.abs(A.f.col[2] - B.f.col[2]);
                const sameLook = colorGap < 0.02 && A.f.m === B.f.m;
                const c = A.f.p.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
                found.push({ at: c.map(v => +v.toFixed(2)), normal: g.n.map(v => +v.toFixed(2)), gap: +Math.abs(A.d - B.d).toFixed(4), area: +area.toFixed(4), mats: A.f.m + "/" + B.f.m, colorGap: +colorGap.toFixed(2), sameLook });
              }
            }
          }
          found.sort((p, q) => (q.sameLook ? 0 : 1) - (p.sameLook ? 0 : 1) || q.area * (q.colorGap + 0.1) - p.area * (p.colorGap + 0.1));
          return found;
        }
      }

      const started = performance.now();
      const wait = () => {
        if (!window.__zfKept) { setTimeout(wait, 200); return; }
        const list = new ZFightDetector(window.__zfKept).run();
        window.__zfReport = { faces: window.__zfKept.length, visible: list.filter(x => !x.sameLook).length, sameLook: list.filter(x => x.sameLook).length, ms: Math.round(performance.now() - started), list };
        console.log("zfight", window.__zfReport.visible, window.__zfReport.sameLook);
      };
      wait();
    }.toString() + ")();";
  }
}

new ZombieZFightPage(process.argv[2], process.argv[3]).build();
