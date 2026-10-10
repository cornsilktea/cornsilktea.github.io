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
  static MECH = "Animated Mech Pack - March 2021-20261009T033213Z-1-001/Animated Mech Pack - March 2021";
  static CHARACTERS = "Ultimate Animated Character Pack - Nov 2019-20261009T033616Z-1-001/Ultimate Animated Character Pack - Nov 2019";
  static SPACE_KIT = "Ultimate Space Kit - March 2023-20261009T033352Z-1-001/Ultimate Space Kit - March 2023";
  static SPACESHIPS = "Ultimate Spaceships - May 2021-20261009T033608Z-1-001/Ultimate Spaceships - May 2021";
  static MODULAR = "Modular SciFi MegaKit[Standard]/Modular SciFi MegaKit[Standard]";
  static ESSENTIALS = "Sci-Fi Essentials Kit[Standard]";
  static GLTF_ONLY = /\.(gltf|glb|bin|png|jpg)$/i;
  static ADVENTURERS_EXTRA = "KayKit_Adventurers_2.0_EXTRA/KayKit_Adventurers_2.0_EXTRA";
  static SKELETONS_EXTRA = "KayKit_Skeletons_1.1_EXTRA/KayKit_Skeletons_1.1_EXTRA";
  static ANIMATIONS = "KayKit_Character_Animations_1.1/KayKit_Character_Animations_1.1";
  static SHIPS = ["Bob", "Challenger", "Dispatcher", "Executioner", "Imperial", "Insurgent", "Omen", "Pancake", "Spitfire", "Striker", "Zenith"];

  static jobs() {
    const jobs = [
      new ExtraPackJob(`${ExtraPackPlan.MECH}/Textured/glTF`, "characters/quaternius-mech", /\.gltf$/i),
      new ExtraPackJob(`${ExtraPackPlan.MECH}/Flat Colors/glTF`, "characters/quaternius-mech/flat-colors", /\.gltf$/i),
      new ExtraPackJob(`${ExtraPackPlan.CHARACTERS}/glTF`, "characters/quaternius-animated-characters", /\.gltf$/i),
      new ExtraPackJob(`${ExtraPackPlan.SPACE_KIT}/Characters/GLTF`, "models/quaternius-ultimate-space-kit/characters", /\.gltf$/i),
      new ExtraPackJob(`${ExtraPackPlan.SPACE_KIT}/Environment/GLTF`, "models/quaternius-ultimate-space-kit/environment", /\.gltf$/i),
      new ExtraPackJob(`${ExtraPackPlan.SPACE_KIT}/Items/GLTF`, "models/quaternius-ultimate-space-kit/items", /\.gltf$/i),
      new ExtraPackJob(`${ExtraPackPlan.SPACE_KIT}/Vehicles/GLTF`, "models/quaternius-ultimate-space-kit/vehicles", /\.gltf$/i),
      new ExtraPackJob(`${ExtraPackPlan.MODULAR}/glTF`, "models/quaternius-modular-scifi", /\.(gltf|bin)$/i),
      new ExtraPackJob(`${ExtraPackPlan.MODULAR}/Textures`, "models/quaternius-modular-scifi/textures", /\.png$/i),
      new ExtraPackJob(`${ExtraPackPlan.ESSENTIALS}/glTF`, "models/quaternius-scifi-essentials", ExtraPackPlan.GLTF_ONLY),
      new ExtraPackJob("kenney_space-kit/Models/GLTF format", "models/kenney-space-kit", /\.glb$/i),
      new ExtraPackJob("kenney_space-station-kit/Models/GLB format", "models/kenney-space-station", /\.(glb|png)$/i),
      new ExtraPackJob("kenney_modular-space-kit_1.0/Models/GLB format", "models/kenney-modular-space", /\.(glb|png)$/i),
    ];
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
    for (const ship of ExtraPackPlan.SHIPS) {
      jobs.push(new ExtraPackJob(`${ExtraPackPlan.SPACESHIPS}/${ship}/glTF`, "models/quaternius-ultimate-spaceships", /\.gltf$/i));
      jobs.push(new ExtraPackJob(`${ExtraPackPlan.SPACESHIPS}/${ship}/Textures`, `models/quaternius-ultimate-spaceships/textures/${ship}`, /\.png$/i));
    }
    return jobs;
  }

  static licenses() {
    return [
      [`${ExtraPackPlan.MECH}/License.txt`, "Quaternius-AnimatedMechPack.txt"],
      [`${ExtraPackPlan.CHARACTERS}/License.txt`, "Quaternius-UltimateAnimatedCharacterPack.txt"],
      [`${ExtraPackPlan.SPACE_KIT}/License.txt`, "Quaternius-UltimateSpaceKit.txt"],
      [`${ExtraPackPlan.SPACESHIPS}/License.txt`, "Quaternius-UltimateSpaceships.txt"],
      [`${ExtraPackPlan.MODULAR}/License_Standard.txt`, "Quaternius-ModularSciFiMegaKit.txt"],
      [`${ExtraPackPlan.ESSENTIALS}/License_Standard.txt`, "Quaternius-SciFiEssentialsKit.txt"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/License.txt`, "KayKit-Adventurers-EXTRA.txt"],
      [`${ExtraPackPlan.SKELETONS_EXTRA}/License.txt`, "KayKit-Skeletons-EXTRA.txt"],
      [`${ExtraPackPlan.ANIMATIONS}/License.txt`, "KayKit-CharacterAnimations.txt"],
      ["kenney_space-kit/License.txt", "Kenney-SpaceKit.txt"],
      ["kenney_space-station-kit/License.txt", "Kenney-SpaceStationKit.txt"],
      ["kenney_modular-space-kit_1.0/License.txt", "Kenney-ModularSpaceKit.txt"],
    ];
  }

  static previews() {
    return [
      [`${ExtraPackPlan.MECH}/Preview.jpg`, "quaternius-mech.jpg"],
      [`${ExtraPackPlan.CHARACTERS}/Preview.png`, "quaternius-animated-characters.png"],
      [`${ExtraPackPlan.SPACE_KIT}/Preview.jpg`, "quaternius-ultimate-space-kit.jpg"],
      [`${ExtraPackPlan.ESSENTIALS}/Preview_1.jpg`, "quaternius-scifi-essentials.jpg"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/contents.png`, "kaykit-adventurers-extra.png"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/Samples/alternative_textures.png`, "kaykit-adventurers-alt-textures.png"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/Samples/barbarian_Large.png`, "kaykit-barbarian-large.png"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/Samples/druid.png`, "kaykit-druid.png"],
      [`${ExtraPackPlan.ADVENTURERS_EXTRA}/Samples/engineer.png`, "kaykit-engineer.png"],
      [`${ExtraPackPlan.SKELETONS_EXTRA}/contents.png`, "kaykit-skeletons-extra.png"],
      [`${ExtraPackPlan.SKELETONS_EXTRA}/Samples/golem.png`, "kaykit-skeleton-golem.png"],
      [`${ExtraPackPlan.SKELETONS_EXTRA}/Samples/necromancer.png`, "kaykit-necromancer.png"],
      ["kenney_space-kit/Preview.png", "kenney-space-kit.png"],
      ["kenney_space-station-kit/Preview.png", "kenney-space-station.png"],
      ["kenney_modular-space-kit_1.0/Preview.png", "kenney-modular-space.png"],
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

class SharedTextureRelinker {
  constructor(packRoot, textureFolderName) {
    this.packRoot = packRoot;
    this.textureFolderName = textureFolderName;
    this.rewritten = 0;
  }

  walk(directory, depth) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== this.textureFolderName) this.walk(fullPath, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".gltf")) this.relink(fullPath, depth);
    }
  }

  relink(filePath, depth) {
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const prefix = "../".repeat(depth) + this.textureFolderName + "/";
    let changed = false;
    const ownBin = path.basename(filePath, ".gltf") + ".bin";
    for (const buffer of json.buffers || []) {
      const missing = buffer.uri && !buffer.uri.startsWith("data:") && !fs.existsSync(path.join(path.dirname(filePath), buffer.uri));
      if (missing && fs.existsSync(path.join(path.dirname(filePath), ownBin))) {
        buffer.uri = ownBin;
        changed = true;
      }
    }
    for (const image of json.images || []) {
      if (image.uri && !image.uri.startsWith("data:") && !image.uri.startsWith("../")) {
        image.uri = prefix + image.uri;
        changed = true;
      }
    }
    if (!changed) return;
    fs.writeFileSync(filePath, JSON.stringify(json));
    this.rewritten++;
  }

  run() {
    this.walk(this.packRoot, 0);
    console.log(`공용 텍스처 경로로 고친 .gltf ${this.rewritten}개 (${this.textureFolderName}/)`);
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
new SharedTextureRelinker(path.join(outputRoot, "models", "quaternius-modular-scifi"), "textures").run();
new ExtraReferenceChecker(outputRoot).run();
