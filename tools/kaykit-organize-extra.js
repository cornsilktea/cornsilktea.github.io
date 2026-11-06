const fs = require("fs");
const path = require("path");

class ExtraPackJob {
  constructor(sourceRelative, destinationRelative, includePattern, onlyNew) {
    this.sourceRelative = sourceRelative;
    this.destinationRelative = destinationRelative;
    this.includePattern = includePattern || /./;
    this.onlyNew = onlyNew === true;
  }
}

class ExtraPackPlan {
  static GLTF_ONLY = /\.(gltf|glb|bin|png|jpg)$/i;
  static ADVENTURERS_EXTRA = "KayKit_Adventurers_2.0_EXTRA/KayKit_Adventurers_2.0_EXTRA";
  static SKELETONS_EXTRA = "KayKit_Skeletons_1.1_EXTRA/KayKit_Skeletons_1.1_EXTRA";
  static ANIMATIONS = "KayKit_Character_Animations_1.1/KayKit_Character_Animations_1.1";
  static MIXED_BAG_2 = "KayKit_Mixed_Bag_2_FREE/KayKit_Mixed_Bag_2_FREE";

  static jobs() {
    const jobs = [];
    jobs.push(
      new ExtraPackJob(`${ExtraPackPlan.ADVENTURERS_EXTRA}/Characters/gltf`, "characters/adventurers", /\.glb$/i, true),
      new ExtraPackJob(`${ExtraPackPlan.ADVENTURERS_EXTRA}/Textures`, "characters/adventurers/textures", /\.png$/i, true),
      new ExtraPackJob(`${ExtraPackPlan.ADVENTURERS_EXTRA}/Assets/gltf`, "models/adventurer-gear", ExtraPackPlan.GLTF_ONLY, true),
      new ExtraPackJob(`${ExtraPackPlan.SKELETONS_EXTRA}/characters/gltf`, "characters/skeletons", /\.glb$/i, true),
      new ExtraPackJob(`${ExtraPackPlan.SKELETONS_EXTRA}/textures`, "characters/skeletons/textures", /\.png$/i, true),
      new ExtraPackJob(`${ExtraPackPlan.SKELETONS_EXTRA}/assets/gltf`, "models/skeleton-gear", ExtraPackPlan.GLTF_ONLY, true),
      new ExtraPackJob(`${ExtraPackPlan.ANIMATIONS}/Animations/gltf/Rig_Large`, "animations/rig-large", /\.glb$/i),
      new ExtraPackJob(`${ExtraPackPlan.ANIMATIONS}/Mannequin Character/characters`, "characters/mannequin", /\.glb$/i),
    );
    jobs.push(
      new ExtraPackJob(`${ExtraPackPlan.MIXED_BAG_2}/Assets/gltf`, "models/mixed-bag-2", ExtraPackPlan.GLTF_ONLY, true),
      new ExtraPackJob(`${ExtraPackPlan.MIXED_BAG_2}/Textures`, "models/mixed-bag-2", /\.png$/i, true),
    );
    return jobs;
  }

  static licenses() {
    return [
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/License.txt`, "KayKit-Adventurers-EXTRA.txt"],
      [`${ExtraPackPlan.SKELETONS_EXTRA}/License.txt`, "KayKit-Skeletons-EXTRA.txt"],
      [`${ExtraPackPlan.ANIMATIONS}/License.txt`, "KayKit-CharacterAnimations.txt"],
      [`${ExtraPackPlan.MIXED_BAG_2}/License.txt`, "KayKit-MixedBag2.txt"],
    ];
  }

  static previews() {
    return [
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/contents.png`, "kaykit-adventurers-extra.png"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/Samples/alternative_textures.png`, "kaykit-adventurers-alt-textures.png"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/Samples/barbarian_Large.png`, "kaykit-barbarian-large.png"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/Samples/druid.png`, "kaykit-druid.png"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/Samples/engineer.png`, "kaykit-engineer.png"],
      [`${ExtraPackPlan.SKELETONS_EXTRA}/contents.png`, "kaykit-skeletons-extra.png"],
      [`${ExtraPackPlan.SKELETONS_EXTRA}/Samples/golem.png`, "kaykit-skeleton-golem.png"],
      [`${ExtraPackPlan.SKELETONS_EXTRA}/Samples/necromancer.png`, "kaykit-necromancer.png"],
    ];
  }
}

class ExtraPackOrganizer {
  constructor(downloadRoot, outputRoot) {
    this.downloadRoot = downloadRoot;
    this.outputRoot = outputRoot;
    this.copied = 0;
    this.missing = [];
  }

  copyFile(source, destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    this.copied++;
  }

  copyTree(source, destination, include, onlyNew) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name);
      const to = path.join(destination, entry.name);
      if (entry.isDirectory()) this.copyTree(from, to, include, onlyNew);
      else if (include.test(entry.name) && !(onlyNew && fs.existsSync(to))) this.copyFile(from, to);
    }
  }

  copyOptional(relativeSource, relativeDestination) {
    const source = path.join(this.downloadRoot, relativeSource);
    if (!fs.existsSync(source)) {
      this.missing.push(relativeSource);
      return;
    }
    this.copyFile(source, path.join(this.outputRoot, relativeDestination));
  }

  run() {
    for (const job of ExtraPackPlan.jobs()) {
      const source = path.join(this.downloadRoot, job.sourceRelative);
      if (!fs.existsSync(source)) {
        this.missing.push(job.sourceRelative);
        continue;
      }
      this.copyTree(source, path.join(this.outputRoot, job.destinationRelative), job.includePattern, job.onlyNew);
    }
    for (const [source, name] of ExtraPackPlan.licenses()) this.copyOptional(source, path.join("licenses", name));
    for (const [source, name] of ExtraPackPlan.previews()) this.copyOptional(source, path.join("previews", name));
    console.log(`복사한 파일 ${this.copied}개, 없는 원본 ${this.missing.length}개`);
    for (const line of this.missing) console.log("  없음: " + line);
  }
}

class ExtraReferenceChecker {
  constructor(outputRoot) {
    this.outputRoot = outputRoot;
    this.checked = 0;
    this.broken = [];
  }

  walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) this.walk(fullPath);
      else if (entry.name.toLowerCase().endsWith(".gltf")) this.check(fullPath);
    }
  }

  check(filePath) {
    this.checked++;
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const uris = [...(json.buffers || []), ...(json.images || [])].map((item) => item.uri).filter((uri) => uri && !uri.startsWith("data:"));
    for (const uri of uris) {
      if (!fs.existsSync(path.join(path.dirname(filePath), decodeURIComponent(uri)))) this.broken.push(`${path.relative(this.outputRoot, filePath)} -> ${uri}`);
    }
  }

  run() {
    this.walk(this.outputRoot);
    console.log(`.gltf ${this.checked}개 검사, 끊어진 연결 ${this.broken.length}개`);
    for (const line of this.broken.slice(0, 20)) console.log("  " + line);
  }
}

const downloadRoot = process.argv[2];
const outputRoot = process.argv[3];
new ExtraPackOrganizer(downloadRoot, outputRoot).run();
new ExtraReferenceChecker(outputRoot).run();
