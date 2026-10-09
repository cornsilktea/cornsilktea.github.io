const fs = require("fs");
const path = require("path");

const SOURCE_DIRECTORY = process.argv[2] || "C:\\Users\\user\\Downloads\\3d-assets\\organized\\animations\\rig-medium";
const OUTPUT_FILE = process.argv[3] || "assets/kaykit/animations/soccer_anims.glb";
const PACKS = {
  soccer: [
    { file: "Rig_Medium_MovementAdvanced.glb", clips: ["Dodge_Forward"] },
    { file: "Rig_Medium_Simulation.glb", clips: ["Cheering"] },
    { file: "Rig_Medium_CombatMelee.glb", clips: ["Melee_Unarmed_Attack_Kick"] },
    { file: "Rig_Medium_General.glb", clips: ["Hit_B"] }
  ],
  glassbridge: [
    { file: "Rig_Medium_MovementBasic.glb", clips: ["Jump_Full_Short", "Jump_Idle", "Jump_Land"] },
    { file: "Rig_Medium_General.glb", clips: ["Idle_B", "Interact", "PickUp", "Spawn_Air", "Death_B", "Hit_B"] },
    { file: "Rig_Medium_Simulation.glb", clips: ["Cheering"] }
  ],
  raid: [
    { file: "Rig_Medium_MovementAdvanced.glb", clips: ["Dodge_Forward"] },
    { file: "Rig_Medium_Special.glb", clips: ["Skeletons_Spawn_Ground", "Skeletons_Awaken_Standing"] },
    { file: "Rig_Medium_General.glb", clips: ["Hit_B", "Spawn_Ground"] },
    { file: "Rig_Medium_Simulation.glb", clips: ["Cheering"] }
  ]
};
const WANTED = PACKS[process.argv[4] || "soccer"];
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

class GlbFile {
  constructor(file) {
    const buffer = fs.readFileSync(file);
    const jsonLength = buffer.readUInt32LE(12);
    this.json = JSON.parse(buffer.slice(20, 20 + jsonLength).toString("utf8"));
    const binLength = buffer.readUInt32LE(20 + jsonLength);
    this.bin = buffer.slice(28 + jsonLength, 28 + jsonLength + binLength);
  }

  accessorBytes(index) {
    const accessor = this.json.accessors[index];
    const view = this.json.bufferViews[accessor.bufferView];
    const size = accessor.count * TYPE_COUNTS[accessor.type] * COMPONENT_BYTES[accessor.componentType];
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    return { accessor, bytes: this.bin.slice(start, start + size) };
  }
}

class AnimationPack {
  constructor(baseJson) {
    this.nodes = baseJson.nodes.map((node) => {
      const copy = Object.assign({}, node);
      delete copy.mesh;
      delete copy.skin;
      delete copy.camera;
      return copy;
    });
    this.scenes = baseJson.scenes;
    this.nodeIndexByName = new Map(this.nodes.map((node, index) => [node.name, index]));
    this.chunks = [];
    this.offset = 0;
    this.bufferViews = [];
    this.accessors = [];
    this.animations = [];
  }

  addClip(glb, clipName) {
    const source = glb.json.animations.find((animation) => animation.name === clipName);
    if (!source) throw new Error("클립이 없어요: " + clipName);
    const samplerMap = new Map();
    const samplers = source.samplers.map((sampler, index) => {
      const converted = { input: this.copyAccessor(glb, sampler.input), output: this.copyAccessor(glb, sampler.output), interpolation: sampler.interpolation || "LINEAR" };
      samplerMap.set(index, converted);
      return converted;
    });
    const channels = [];
    source.channels.forEach((channel) => {
      const name = glb.json.nodes[channel.target.node].name;
      const target = this.nodeIndexByName.get(name);
      if (target === undefined) return;
      channels.push({ sampler: channel.sampler, target: { node: target, path: channel.target.path } });
    });
    this.animations.push({ name: clipName, samplers, channels });
  }

  copyAccessor(glb, index) {
    const { accessor, bytes } = glb.accessorBytes(index);
    const padding = (4 - (bytes.length % 4)) % 4;
    this.chunks.push(bytes, Buffer.alloc(padding));
    this.bufferViews.push({ buffer: 0, byteOffset: this.offset, byteLength: bytes.length });
    this.offset += bytes.length + padding;
    const created = { bufferView: this.bufferViews.length - 1, byteOffset: 0, componentType: accessor.componentType, count: accessor.count, type: accessor.type };
    if (accessor.min) created.min = accessor.min;
    if (accessor.max) created.max = accessor.max;
    this.accessors.push(created);
    return this.accessors.length - 1;
  }

  toGlb() {
    const bin = Buffer.concat(this.chunks);
    const json = { asset: { version: "2.0", generator: "tools/mk-anim-pack.js" }, scene: 0, scenes: this.scenes, nodes: this.nodes, buffers: [{ byteLength: bin.length }], bufferViews: this.bufferViews, accessors: this.accessors, animations: this.animations };
    let jsonText = JSON.stringify(json);
    jsonText += " ".repeat((4 - (jsonText.length % 4)) % 4);
    const jsonBuffer = Buffer.from(jsonText, "utf8");
    const total = 12 + 8 + jsonBuffer.length + 8 + bin.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546C67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(total, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
    jsonHeader.writeUInt32LE(0x4E4F534A, 4);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(bin.length, 0);
    binHeader.writeUInt32LE(0x004E4942, 4);
    return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, bin]);
  }
}

const files = WANTED.map((entry) => ({ entry, glb: new GlbFile(path.join(SOURCE_DIRECTORY, entry.file)) }));
const pack = new AnimationPack(files[0].glb.json);
files.forEach(({ entry, glb }) => entry.clips.forEach((clip) => pack.addClip(glb, clip)));
fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, pack.toGlb());
console.log("만들었어요:", OUTPUT_FILE, fs.statSync(OUTPUT_FILE).size + " bytes, 클립 " + pack.animations.map((a) => a.name + "(" + a.channels.length + "채널)").join(", "));
