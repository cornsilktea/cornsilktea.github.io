const fs = require("fs");
const path = require("path");

class GltfReader {
  static read(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (filePath.toLowerCase().endsWith(".gltf")) return JSON.parse(buffer.toString("utf8"));
    const jsonLength = buffer.readUInt32LE(12);
    return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
  }
}

class ModelSummary {
  constructor(json, fileSize) {
    this.json = json;
    this.fileSize = fileSize;
  }

  triangleCount() {
    let total = 0;
    for (const mesh of this.json.meshes || []) {
      for (const primitive of mesh.primitives || []) {
        const countAccessor = primitive.indices !== undefined ? primitive.indices : primitive.attributes.POSITION;
        const count = this.json.accessors[countAccessor].count;
        total += primitive.indices !== undefined ? count / 3 : count / 3;
      }
    }
    return Math.round(total);
  }

  size() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of this.json.meshes || []) {
      for (const primitive of mesh.primitives || []) {
        const accessor = this.json.accessors[primitive.attributes.POSITION];
        if (!accessor.min || !accessor.max) continue;
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], accessor.min[axis]);
          max[axis] = Math.max(max[axis], accessor.max[axis]);
        }
      }
    }
    if (min[0] === Infinity) return null;
    return max.map((value, axis) => Math.round((value - min[axis]) * 100) / 100);
  }

  animations() {
    return (this.json.animations || []).map((animation) => {
      let duration = 0;
      for (const sampler of animation.samplers) {
        const accessor = this.json.accessors[sampler.input];
        if (accessor.max) duration = Math.max(duration, accessor.max[0]);
      }
      return { name: animation.name, seconds: Math.round(duration * 100) / 100 };
    });
  }

  jointCount() {
    return (this.json.skins || []).reduce((sum, skin) => sum + skin.joints.length, 0);
  }

  materialNames() {
    return (this.json.materials || []).map((material) => material.name).filter(Boolean);
  }

  textureNames() {
    return (this.json.images || []).map((image) => image.uri || "(내장)");
  }

  toRecord() {
    const record = { tris: this.triangleCount(), size: this.size(), kb: Math.round(this.fileSize / 1024) };
    const animations = this.animations();
    if (animations.length) record.animations = animations;
    const joints = this.jointCount();
    if (joints) record.joints = joints;
    const materials = this.materialNames();
    if (materials.length) record.materials = materials;
    const textures = this.textureNames();
    if (textures.length) record.textures = textures;
    return record;
  }
}

class FbxModelNames {
  static read(filePath) {
    const text = fs.readFileSync(filePath).toString("latin1");
    const names = new Set();
    for (const match of text.matchAll(/([\w.\-]+)\x00\x01Model/g)) names.add(match[1]);
    return [...names];
  }
}

class PackScanner {
  static SKIP_DIRECTORIES = new Set(["KayKit Brand Resouces", "Documentation", "Samples", "samples", "texture", "Textures", "obj", "dae"]);
  static MODEL_EXTENSIONS = new Set([".gltf", ".glb"]);

  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory;
  }

  walk(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!PackScanner.SKIP_DIRECTORIES.has(entry.name)) files.push(...this.walk(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  categoryOf(relativePath) {
    const parts = relativePath.split(path.sep);
    const kept = parts.slice(0, -1).filter((part) => !/^(gltf|fbx.*|Assets|assets|Models|KayKit_.*_FREE|Single Animations)$/i.test(part));
    return kept.join("/") || "(루트)";
  }

  baseName(fileName) {
    return fileName.replace(/\.gltf\.glb$/i, "").replace(/\.(gltf|glb|fbx)$/i, "");
  }

  scanPack(packName) {
    const packDirectory = path.join(this.rootDirectory, packName);
    const files = this.walk(packDirectory);
    const models = [];
    const gltfKeys = new Set();
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (!PackScanner.MODEL_EXTENSIONS.has(extension)) continue;
      const relative = path.relative(packDirectory, file);
      const category = this.categoryOf(relative);
      const name = this.baseName(path.basename(file));
      gltfKeys.add(`${category}|${name}`.toLowerCase());
      const record = new ModelSummary(GltfReader.read(file), fs.statSync(file).size).toRecord();
      models.push({ category, name, file: relative.split(path.sep).join("/"), ...record });
    }
    const fbxOnly = [];
    for (const file of files) {
      if (path.extname(file).toLowerCase() !== ".fbx") continue;
      const relative = path.relative(packDirectory, file);
      const category = this.categoryOf(relative);
      const name = this.baseName(path.basename(file));
      if (gltfKeys.has(`${category}|${name}`.toLowerCase())) continue;
      if (/unity/i.test(relative) && gltfKeys.size > 0 && [...gltfKeys].some((key) => key.endsWith(`|${name.toLowerCase()}`))) continue;
      fbxOnly.push({ category, name, file: relative.split(path.sep).join("/"), kb: Math.round(fs.statSync(file).size / 1024) });
    }
    return { pack: packName, models, fbxOnly };
  }

  scanAll() {
    const packNames = fs.readdirSync(this.rootDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    return packNames.map((packName) => this.scanPack(packName));
  }
}


class RepoUsage {
  static FOLDERS_BY_PACK = [
    [/Dungeon/, ["dungeon"]],
    [/Medieval Builder/, ["medieval"]],
    [/Adventurers|Skeletons/, ["characters", "props"]],
  ];
  static DEFAULT_FOLDERS = ["props"];

  constructor(repoKayKitRoot) {
    this.namesByFolder = new Map();
    for (const entry of fs.readdirSync(repoKayKitRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) this.namesByFolder.set(entry.name, this.collect(path.join(repoKayKitRoot, entry.name), new Set()));
    }
  }

  collect(directory, names) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) this.collect(fullPath, names);
      else if (/\.(glb|gltf)$/i.test(entry.name)) names.add(entry.name.replace(/\.(glb|gltf)$/i, "").toLowerCase());
    }
    return names;
  }

  foldersOf(packName) {
    const rule = RepoUsage.FOLDERS_BY_PACK.find(([pattern]) => pattern.test(packName));
    return rule ? rule[1] : RepoUsage.DEFAULT_FOLDERS;
  }

  has(packName, modelName) {
    return this.foldersOf(packName).some((folder) => this.namesByFolder.get(folder)?.has(modelName.toLowerCase()));
  }
}
class NamesMarkdown {
  constructor(catalog, repoUsage) {
    this.catalog = catalog;
    this.repoUsage = repoUsage;
  }

  label(pack, model) {
    return this.repoUsage.has(pack.pack, model.name) ? `${model.name}*` : model.name;
  }

  animationSection() {
    const lines = ["## 애니메이션 클립 (glb 에서 읽은 실제 이름)", ""];
    for (const pack of this.catalog) {
      for (const model of pack.models) {
        if (!model.animations) continue;
        lines.push(`### ${pack.pack} / ${model.name}  (뼈 ${model.joints}개, 클립 ${model.animations.length}개)`);
        lines.push(model.animations.map((clip) => `${clip.name}(${clip.seconds}s)`).join(", "), "");
      }
    }
    return lines;
  }

  packSection(pack) {
    const staticModels = pack.models.filter((model) => !model.animations);
    if (!staticModels.length) return [];
    const lines = [`## ${pack.pack}  (${staticModels.length}개)`, ""];
    const byCategory = new Map();
    for (const model of staticModels) {
      if (!byCategory.has(model.category)) byCategory.set(model.category, []);
      byCategory.get(model.category).push(model);
    }
    for (const [category, models] of byCategory) {
      lines.push(`### ${category} (${models.length})`);
      lines.push(models.map((model) => this.label(pack, model)).join(", "), "");
    }
    return lines;
  }

  render() {
    const lines = ["# KayKit 에셋 전체 이름표 (자동 생성)", "", "`*` 표시는 이미 이 저장소 `assets/kaykit/` 에 복사해 둔 모델(이름이 같은 모델로 판단). 만든 도구: `tools/kaykit-catalog.js`", ""];
    lines.push(...this.animationSection());
    for (const pack of this.catalog) lines.push(...this.packSection(pack));
    return lines.join("\n");
  }
}

class CatalogCommand {
  run(sourceRoot, repoKayKitRoot, outputDirectory) {
    const catalog = new PackScanner(sourceRoot).scanAll();
    const repoCatalog = new PackScanner(repoKayKitRoot).scanAll().filter((pack) => pack.pack === "animations");
    for (const pack of repoCatalog) {
      pack.pack = "(저장소 assets/kaykit/animations)";
      pack.models = pack.models.filter((model) => model.name !== "teambattle_anims");
      catalog.push(pack);
    }
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, "catalog.json"), JSON.stringify(catalog));
    fs.writeFileSync(path.join(outputDirectory, "names.md"), new NamesMarkdown(catalog, new RepoUsage(repoKayKitRoot)).render());
    for (const pack of catalog) console.log(`${pack.pack}\tmodels=${pack.models.length}\tfbxOnly=${pack.fbxOnly.length}`);
  }
}

new CatalogCommand().run(process.argv[2], process.argv[3], process.argv[4]);
