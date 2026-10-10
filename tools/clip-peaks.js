const fs = require("fs");
const file = process.argv[2], wanted = process.argv.slice(3);
const b = fs.readFileSync(file);
const jl = b.readUInt32LE(12);
const json = JSON.parse(b.slice(20, 20 + jl).toString("utf8"));
const binStart = 20 + jl + 8;
const bin = b.slice(binStart);
function acc(i) {
  const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0);
  const out = [];
  for (let k = 0; k < a.count; k++) { const row = []; for (let c = 0; c < n; c++) row.push(bin.readFloatLE(off + (k * n + c) * 4)); out.push(row); }
  return out;
}
function angle(q1, q2) {
  const d = Math.abs(q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3]);
  return 2 * Math.acos(Math.min(1, d));
}
json.animations.forEach((anim) => {
  if (wanted.length && wanted.indexOf(anim.name) < 0) return;
  const dur = Math.max(...anim.samplers.map((s) => Math.max(...acc(s.input).map((r) => r[0]))));
  console.log("== " + anim.name + " dur " + dur.toFixed(2));
  ["upperarm.r", "lowerarm.r", "hand.r", "upperarm.l", "chest", "hips"].forEach((bone) => {
    const ch = anim.channels.find((c) => json.nodes[c.target.node].name === bone && c.target.path === "rotation");
    if (!ch) return;
    const s = anim.samplers[ch.sampler], t = acc(s.input).map((r) => r[0]), q = acc(s.output);
    const sp = [];
    for (let i = 1; i < t.length; i++) sp.push([(t[i] + t[i - 1]) / 2, angle(q[i], q[i - 1]) / Math.max(1e-6, t[i] - t[i - 1])]);
    const top = sp.slice().sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0].toFixed(2) + "s:" + x[1].toFixed(1));
    const prof = sp.filter((_, i) => i % Math.ceil(sp.length / 14) === 0).map((x) => x[0].toFixed(2) + ":" + x[1].toFixed(1)).join(" ");
    console.log(bone.padEnd(11), "peak", top.join(" | "));
    if (bone === "upperarm.r") console.log("  profile", prof);
  });
});
