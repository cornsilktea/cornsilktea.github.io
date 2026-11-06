/* =====================================================================
   QR 코드 그리기 (외부 라이브러리 없이 이 파일 하나로 동작)

   목록 화면(index.html)이 반마다 다른 링크(?c=1-1 …)의 QR 을 그릴 때 씁니다.
   바이트 모드, 오류 정정 M, 버전 1~10(최대 213바이트)까지 만듭니다.

     QR.draw(canvasElement, "https://…", { size: 460, margin: 4 })

   canvas 를 정사각형(size 픽셀)으로 맞추고 QR 을 그린 뒤 그 canvas 를 돌려줍니다.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- 오류 정정 M 의 버전별 구조 ----------
     ec: 블록마다 붙는 오류 정정 코드워드 수
     blocks: [블록 수, 블록당 데이터 코드워드 수] 묶음(길이가 다른 두 묶음이 있는 버전도 있음) */
  var VERSIONS = [
    null,
    { ec: 10, blocks: [[1, 16]] },
    { ec: 16, blocks: [[1, 28]] },
    { ec: 26, blocks: [[1, 44]] },
    { ec: 18, blocks: [[2, 32]] },
    { ec: 24, blocks: [[2, 43]] },
    { ec: 16, blocks: [[4, 27]] },
    { ec: 18, blocks: [[4, 31]] },
    { ec: 22, blocks: [[2, 38], [2, 39]] },
    { ec: 22, blocks: [[3, 36], [2, 37]] },
    { ec: 26, blocks: [[4, 43], [1, 44]] }
  ];

  function dataCapacity(v) {
    var n = 0;
    VERSIONS[v].blocks.forEach(function (b) { n += b[0] * b[1]; });
    return n;
  }

  /* ---------- GF(256) 산술 (리드-솔로몬) ---------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function generatorPoly(degree) {
    var g = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(g.length + 1);
      for (var k = 0; k < next.length; k++) next[k] = 0;
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function ecCodewords(data, degree) {
    var gen = generatorPoly(degree);
    var rem = new Array(degree);
    for (var i = 0; i < degree; i++) rem[i] = 0;
    for (var d = 0; d < data.length; d++) {
      var factor = data[d] ^ rem[0];
      rem.shift(); rem.push(0);
      for (var j = 0; j < degree; j++) rem[j] ^= mul(gen[j + 1], factor);
    }
    return rem;
  }

  /* ---------- 문자열 → 바이트(UTF-8) ---------- */
  function toBytes(text) {
    var s = unescape(encodeURIComponent(text));
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  /* ---------- 데이터 비트열 → 코드워드 ---------- */
  function buildCodewords(bytes, v) {
    var cap = dataCapacity(v);
    var bits = [];
    function push(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4);                                  /* 바이트 모드 */
    push(bytes.length, v < 10 ? 8 : 16);          /* 글자 수 */
    bytes.forEach(function (b) { push(b, 8); });
    var maxBits = cap * 8;
    push(0, Math.min(4, maxBits - bits.length));  /* 종료 */
    while (bits.length % 8 !== 0) bits.push(0);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
      data.push(b);
    }
    for (var pad = 0xEC; data.length < cap; pad ^= 0xEC ^ 0x11) data.push(pad);

    /* 블록으로 나눠 오류 정정 코드워드를 붙이고 서로 끼워 넣습니다 */
    var info = VERSIONS[v];
    var blocks = [], ecs = [], pos = 0;
    info.blocks.forEach(function (g) {
      for (var n = 0; n < g[0]; n++) {
        var chunk = data.slice(pos, pos + g[1]);
        pos += g[1];
        blocks.push(chunk);
        ecs.push(ecCodewords(chunk, info.ec));
      }
    });
    var out = [];
    var longest = 0;
    blocks.forEach(function (b) { if (b.length > longest) longest = b.length; });
    for (var i2 = 0; i2 < longest; i2++) {
      blocks.forEach(function (b) { if (i2 < b.length) out.push(b[i2]); });
    }
    for (var j2 = 0; j2 < info.ec; j2++) {
      ecs.forEach(function (e) { out.push(e[j2]); });
    }
    return out;
  }

  /* ---------- 모듈(칸) 배치 ---------- */
  function alignmentPositions(v) {
    if (v === 1) return [];
    var size = v * 4 + 17;
    var num = Math.floor(v / 7) + 2;
    var step = (v === 32) ? 26 : Math.ceil((v * 4 + 4) / (num * 2 - 2)) * 2;
    var out = [6];
    for (var pos = size - 7; out.length < num; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  function Matrix(size) {
    this.size = size;
    this.m = [];      /* 어둡게 칠할 칸 */
    this.f = [];      /* 기능 패턴(데이터가 아닌 칸) */
    for (var y = 0; y < size; y++) {
      this.m.push(new Array(size)); this.f.push(new Array(size));
      for (var x = 0; x < size; x++) { this.m[y][x] = false; this.f[y][x] = false; }
    }
  }
  Matrix.prototype.setF = function (x, y, dark) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.m[y][x] = dark; this.f[y][x] = true;
  };

  function drawFinder(mx, cx, cy) {
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var d = Math.max(Math.abs(dx), Math.abs(dy));
      mx.setF(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  }
  function drawAlign(mx, cx, cy) {
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      mx.setF(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  function drawFormat(mx, mask) {
    var data = mask;                         /* 오류 정정 M = 00 */
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    function bit(i) { return ((bits >>> i) & 1) === 1; }
    var s = mx.size, k;
    for (k = 0; k <= 5; k++) mx.setF(8, k, bit(k));
    mx.setF(8, 7, bit(6));
    mx.setF(8, 8, bit(7));
    mx.setF(7, 8, bit(8));
    for (k = 9; k < 15; k++) mx.setF(14 - k, 8, bit(k));
    for (k = 0; k < 8; k++) mx.setF(s - 1 - k, 8, bit(k));
    for (k = 8; k < 15; k++) mx.setF(8, s - 15 + k, bit(k));
    mx.setF(8, s - 8, true);
  }

  function drawVersion(mx, v) {
    if (v < 7) return;
    var rem = v;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (v << 12) | rem;
    for (var k = 0; k < 18; k++) {
      var b = ((bits >>> k) & 1) === 1;
      var a = mx.size - 11 + (k % 3), c = Math.floor(k / 3);
      mx.setF(a, c, b);
      mx.setF(c, a, b);
    }
  }

  function drawFunctions(mx, v) {
    var s = mx.size, i;
    for (i = 0; i < s; i++) { mx.setF(6, i, i % 2 === 0); mx.setF(i, 6, i % 2 === 0); }
    drawFinder(mx, 3, 3); drawFinder(mx, s - 4, 3); drawFinder(mx, 3, s - 4);
    var ap = alignmentPositions(v), n = ap.length;
    for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) {
      if ((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0)) continue;
      drawAlign(mx, ap[a], ap[b]);
    }
    drawFormat(mx, 0);      /* 자리만 잡아 둠(마스크 정한 뒤 다시 씀) */
    drawVersion(mx, v);
  }

  function placeData(mx, codewords) {
    var s = mx.size, i = 0, total = codewords.length * 8;
    for (var right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < s; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? s - 1 - vert : vert;
          if (!mx.f[y][x] && i < total) {
            mx.m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  }
  function applyMask(mx, mask) {
    for (var y = 0; y < mx.size; y++) for (var x = 0; x < mx.size; x++) {
      if (!mx.f[y][x] && maskBit(mask, x, y)) mx.m[y][x] = !mx.m[y][x];
    }
  }

  /* 읽기 쉬운 마스크를 고르기 위한 벌점(규격의 네 가지 규칙) */
  function penalty(mx) {
    var s = mx.size, m = mx.m, score = 0, x, y;
    function runs(get) {
      var r = 0;
      for (var a = 0; a < s; a++) {
        var run = 0, last = null, hist = [];
        for (var b = 0; b < s; b++) {
          var c = get(a, b);
          if (c === last) { run++; if (run === 5) r += 3; else if (run > 5) r++; }
          else { hist.push(run); run = 1; last = c; }
        }
        hist.push(run);
        /* 1:1:3:1:1 (파인더와 닮은 무늬) 앞뒤에 빈칸 4칸 */
        var line = [];
        for (var q = 0; q < s; q++) line.push(get(a, q) ? 1 : 0);
        for (var p = 0; p + 7 <= s; p++) {
          if (line[p] === 1 && line[p + 1] === 0 && line[p + 2] === 1 && line[p + 3] === 1 &&
              line[p + 4] === 1 && line[p + 5] === 0 && line[p + 6] === 1) {
            var before = p >= 4 && line[p - 1] === 0 && line[p - 2] === 0 && line[p - 3] === 0 && line[p - 4] === 0;
            var after = p + 10 <= s - 1 && line[p + 7] === 0 && line[p + 8] === 0 && line[p + 9] === 0 && line[p + 10] === 0;
            if (before || after) r += 40;
          }
        }
      }
      return r;
    }
    score += runs(function (a, b) { return m[a][b]; });
    score += runs(function (a, b) { return m[b][a]; });
    for (y = 0; y < s - 1; y++) for (x = 0; x < s - 1; x++) {
      var c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
    var dark = 0;
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) if (m[y][x]) dark++;
    var pct = dark * 100 / (s * s);
    var k = Math.floor(Math.abs(pct - 50) / 5);
    score += k * 10;
    return score;
  }

  function encode(text) {
    var bytes = toBytes(text);
    var v = 0;
    for (var t = 1; t < VERSIONS.length; t++) {
      var need = 4 + (t < 10 ? 8 : 16) + bytes.length * 8;
      if (need <= dataCapacity(t) * 8) { v = t; break; }
    }
    if (!v) throw new Error("QR 에 넣기에 너무 깁니다");
    var codewords = buildCodewords(bytes, v);
    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var mx = new Matrix(v * 4 + 17);
      drawFunctions(mx, v);
      placeData(mx, codewords);
      applyMask(mx, mask);
      drawFormat(mx, mask);
      var sc = penalty(mx);
      if (sc < bestScore) { bestScore = sc; best = mx; }
    }
    return best;
  }

  function draw(canvas, text, opts) {
    opts = opts || {};
    var size = opts.size || 460, margin = (opts.margin === undefined) ? 4 : opts.margin;
    var mx = encode(text);
    var cells = mx.size + margin * 2;
    var scale = Math.max(1, Math.floor(size / cells));
    var px = scale * cells;
    canvas.width = px; canvas.height = px;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = opts.light || "#ffffff";
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = opts.dark || "#000000";
    for (var y = 0; y < mx.size; y++) for (var x = 0; x < mx.size; x++) {
      if (mx.m[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
    }
    return canvas;
  }

  window.QR = { encode: encode, draw: draw };
})();
