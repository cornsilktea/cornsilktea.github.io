const fs = require("fs");
const path = require("path");

class CopyJob {
  constructor(sourceRelative, destinationRelative) {
    this.sourceRelative = sourceRelative;
    this.destinationRelative = destinationRelative;
  }
}

class OrganizePlan {
  static PACK_FOLDER_JOBS = [
    ["Fantasy Props MegaKit[Standard]/Exports/glTF", "models/fantasy-props"],
    ["KayKit Medieval Builder Pack 1.0/Models/objects/gltf", "models/medieval-builder/objects"],
    ["KayKit Medieval Builder Pack 1.0/Models/tiles/hex/gltf", "models/medieval-builder/tiles-hex"],
    ["KayKit Medieval Builder Pack 1.0/Models/tiles/square/gltf", "models/medieval-builder/tiles-square"],
    ["KayKit_Medieval_Hexagon_Pack_1.0_FREE/KayKit_Medieval_Hexagon_Pack_1.0_FREE/Assets/gltf", "models/medieval-hexagon"],
    ["KayKit_Dungeon_Pack_1.1_FREE/KayKit_Dungeon_Pack_1.1_FREE/Assets/gltf", "models/dungeon"],
    ["KayKit_Forest_Nature_Pack_1.0_FREE/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf", "models/forest-nature"],
    ["KayKit_City_Builder_Bits_1.0_FREE/KayKit_City_Builder_Bits_1.0_FREE/Assets/gltf", "models/city"],
    ["KayKit_Restaurant_Bits_1.0_FREE/KayKit_Restaurant_Bits_1.0_FREE/Assets/gltf", "models/restaurant"],
    ["KayKit_Furniture_Bits_1.0_FREE/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf", "models/furniture"],
    ["KayKit_HalloweenBits_1.0_FREE/KayKit_HalloweenBits_1.0_FREE/Assets/gltf", "models/halloween"],
    ["KayKit_Holiday_Bits_1.0_FREE/KayKit_Holiday_Bits_1.0_FREE/Assets/gltf", "models/holiday"],
    ["KayKit_BoardGameBits_1.0_FREE/KayKit_BoardGameBits_1.0_FREE/Assets/gltf", "models/boardgame"],
    ["KayKit_BlockBits_1.0_FREE/KayKit_BlockBits_1.0_FREE/Assets/gltf", "models/blocks"],
    ["KayKit_Prototype_Bits_1.1_FREE/KayKit_Prototype_Bits_1.1_FREE/Assets/gltf", "models/prototype"],
    ["KayKit_ResourceBits_1.0_FREE/KayKit_ResourceBits_1.0_FREE/Assets/gltf", "models/resources"],
    ["KayKit_RPGToolsBits_1.0_FREE/KayKit_RPGToolsBits_1.0_FREE/Assets/gltf", "models/rpg-tools"],
    ["KayKit_FantasyWeaponsBits_1.0_FREE/KayKit_FantasyWeaponsBits_1.0_FREE/Assets/gltf", "models/weapons"],
    ["KayKit_Space_Base_Bits_1.0_FREE/KayKit_Space_Base_Bits_1.0_FREE/Assets/gltf", "models/space-base"],
    ["KayKit_Mixed_Bag_1_FREE/KayKit_Mixed_Bag_1_FREE/Assets/gltf", "models/mixed-bag"],
    ["KayKit_Adventurers_2.0_FREE/KayKit_Adventurers_2.0_FREE/Assets/gltf", "models/adventurer-gear"],
    ["KayKit_Skeletons_1.1_FREE/KayKit_Skeletons_1.1_FREE/assets/gltf", "models/skeleton-gear"],
    ["KayKit_Skeletons_1.1_FREE/KayKit_Skeletons_1.1_FREE/characters/gltf", "characters/skeletons"],
    ["KayKit_Adventurers_2.0_FREE/KayKit_Adventurers_2.0_FREE/Characters/gltf", "characters/adventurers/textures"],
    ["KayKit Character Animations 1.2/Models/gltf", "characters/prototype-pete"],
    ["KayKit Character Animations 1.2/Animations/gltf", "animations/prototype-pete"],
  ];

  static PREVIEW_IMAGES = [
    ["KayKit_Adventurers_2.0_FREE/KayKit_Adventurers_2.0_FREE/contents.png", "adventurers.png"],
    ["KayKit_Skeletons_1.1_FREE/KayKit_Skeletons_1.1_FREE/contents.png", "skeletons.png"],
    ["KayKit_Dungeon_Pack_1.1_FREE/KayKit_Dungeon_Pack_1.1_FREE/contents.png", "dungeon.png"],
    ["KayKit_Forest_Nature_Pack_1.0_FREE/KayKit_Forest_Nature_Pack_1.0_FREE/contents.png", "forest-nature.png"],
    ["KayKit_City_Builder_Bits_1.0_FREE/KayKit_City_Builder_Bits_1.0_FREE/contents.png", "city.png"],
    ["KayKit_Restaurant_Bits_1.0_FREE/KayKit_Restaurant_Bits_1.0_FREE/contents.png", "restaurant.png"],
    ["KayKit_Furniture_Bits_1.0_FREE/KayKit_Furniture_Bits_1.0_FREE/contents.png", "furniture.png"],
    ["KayKit_HalloweenBits_1.0_FREE/KayKit_HalloweenBits_1.0_FREE/contents.png", "halloween.png"],
    ["KayKit_Holiday_Bits_1.0_FREE/KayKit_Holiday_Bits_1.0_FREE/contents.png", "holiday.png"],
    ["KayKit_BoardGameBits_1.0_FREE/KayKit_BoardGameBits_1.0_FREE/contents.png", "boardgame.png"],
    ["KayKit_BlockBits_1.0_FREE/KayKit_BlockBits_1.0_FREE/contents.png", "blocks.png"],
    ["KayKit_Prototype_Bits_1.1_FREE/KayKit_Prototype_Bits_1.1_FREE/contents.png", "prototype.png"],
    ["KayKit_ResourceBits_1.0_FREE/KayKit_ResourceBits_1.0_FREE/contents.png", "resources.png"],
    ["KayKit_RPGToolsBits_1.0_FREE/KayKit_RPGToolsBits_1.0_FREE/contents.png", "rpg-tools.png"],
    ["KayKit_FantasyWeaponsBits_1.0_FREE/KayKit_FantasyWeaponsBits_1.0_FREE/contents.png", "weapons.png"],
    ["KayKit_Space_Base_Bits_1.0_FREE/KayKit_Space_Base_Bits_1.0_FREE/contents.png", "space-base.png"],
    ["KayKit_Mixed_Bag_1_FREE/KayKit_Mixed_Bag_1_FREE/contents_A.png", "mixed-bag-A.png"],
    ["KayKit_Mixed_Bag_1_FREE/KayKit_Mixed_Bag_1_FREE/contents_B.png", "mixed-bag-B.png"],
    ["KayKit_Medieval_Hexagon_Pack_1.0_FREE/KayKit_Medieval_Hexagon_Pack_1.0_FREE/contents_buildings.jpg", "medieval-hexagon-buildings.jpg"],
    ["KayKit_Medieval_Hexagon_Pack_1.0_FREE/KayKit_Medieval_Hexagon_Pack_1.0_FREE/contents_nature.jpg", "medieval-hexagon-nature.jpg"],
    ["KayKit_Medieval_Hexagon_Pack_1.0_FREE/KayKit_Medieval_Hexagon_Pack_1.0_FREE/contents_tiles.jpg", "medieval-hexagon-tiles.jpg"],
    ["KayKit Medieval Builder Pack 1.0/Overview.png", "medieval-builder.png"],
    ["Fantasy Props MegaKit[Standard]/Preview_1.jpg", "fantasy-props-1.jpg"],
    ["Fantasy Props MegaKit[Standard]/Preview_2.jpg", "fantasy-props-2.jpg"],
    ["Fantasy Props MegaKit[Standard]/Preview_3.jpg", "fantasy-props-3.jpg"],
  ];

  static LICENSE_FILES = [
    ["KayKit_Dungeon_Pack_1.1_FREE/KayKit_Dungeon_Pack_1.1_FREE/License.txt", "KayKit-CC0.txt"],
    ["Fantasy Props MegaKit[Standard]/License_Standard.txt", "Quaternius-FantasyPropsMegaKit.txt"],
  ];

  static REPO_ONLY_FILES = [
    ["animations/Rig_Medium_CombatMelee.glb", "animations/rig-medium/Rig_Medium_CombatMelee.glb"],
    ["animations/Rig_Medium_CombatRanged.glb", "animations/rig-medium/Rig_Medium_CombatRanged.glb"],
    ["animations/Rig_Medium_General.glb", "animations/rig-medium/Rig_Medium_General.glb"],
    ["animations/Rig_Medium_MovementAdvanced.glb", "animations/rig-medium/Rig_Medium_MovementAdvanced.glb"],
    ["animations/Rig_Medium_MovementBasic.glb", "animations/rig-medium/Rig_Medium_MovementBasic.glb"],
    ["animations/Rig_Medium_Simulation.glb", "animations/rig-medium/Rig_Medium_Simulation.glb"],
    ["animations/Rig_Medium_Special.glb", "animations/rig-medium/Rig_Medium_Special.glb"],
    ["animations/Rig_Medium_Tools.glb", "animations/rig-medium/Rig_Medium_Tools.glb"],
    ["animations/teambattle_anims.glb", "animations/combined/teambattle_anims.glb"],
    ["characters/Barbarian.glb", "characters/adventurers/Barbarian.glb"],
    ["characters/Knight.glb", "characters/adventurers/Knight.glb"],
    ["characters/Mage.glb", "characters/adventurers/Mage.glb"],
    ["characters/Ranger.glb", "characters/adventurers/Ranger.glb"],
    ["characters/Rogue.glb", "characters/adventurers/Rogue.glb"],
    ["characters/Rogue_Hooded.glb", "characters/adventurers/Rogue_Hooded.glb"],
  ];
}

class Organizer {
  constructor(downloadRoot, repoKayKitRoot, outputRoot) {
    this.downloadRoot = downloadRoot;
    this.repoKayKitRoot = repoKayKitRoot;
    this.outputRoot = outputRoot;
    this.copiedFiles = 0;
  }

  copyFile(source, destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    this.copiedFiles++;
  }

  copyDirectory(source, destination) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name);
      const to = path.join(destination, entry.name);
      if (entry.isDirectory()) this.copyDirectory(from, to);
      else this.copyFile(from, to);
    }
  }

  run() {
    for (const [source, destination] of OrganizePlan.PACK_FOLDER_JOBS) {
      this.copyDirectory(path.join(this.downloadRoot, source), path.join(this.outputRoot, destination));
    }
    for (const [source, destination] of OrganizePlan.PREVIEW_IMAGES) {
      this.copyFile(path.join(this.downloadRoot, source), path.join(this.outputRoot, "previews", destination));
    }
    for (const [source, destination] of OrganizePlan.LICENSE_FILES) {
      this.copyFile(path.join(this.downloadRoot, source), path.join(this.outputRoot, "licenses", destination));
    }
    for (const [source, destination] of OrganizePlan.REPO_ONLY_FILES) {
      this.copyFile(path.join(this.repoKayKitRoot, source), path.join(this.outputRoot, destination));
    }
    console.log(`복사한 파일 ${this.copiedFiles}개`);
  }
}

class ReferenceChecker {
  constructor(outputRoot) {
    this.outputRoot = outputRoot;
    this.missing = [];
    this.checkedModels = 0;
  }

  walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) this.walk(fullPath);
      else if (entry.name.toLowerCase().endsWith(".gltf")) this.checkGltf(fullPath);
    }
  }

  checkGltf(filePath) {
    this.checkedModels++;
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const references = [...(json.buffers || []), ...(json.images || [])].map((item) => item.uri).filter((uri) => uri && !uri.startsWith("data:"));
    for (const uri of references) {
      if (!fs.existsSync(path.join(path.dirname(filePath), decodeURIComponent(uri)))) this.missing.push(`${path.relative(this.outputRoot, filePath)} -> ${uri}`);
    }
  }

  run() {
    this.walk(this.outputRoot);
    console.log(`.gltf ${this.checkedModels}개 검사, 끊어진 연결 ${this.missing.length}개`);
    for (const line of this.missing.slice(0, 30)) console.log(line);
  }
}

class OrganizeCommand {
  run(downloadRoot, repoKayKitRoot, outputRoot) {
    new Organizer(downloadRoot, repoKayKitRoot, outputRoot).run();
    new ReferenceChecker(outputRoot).run();
  }
}

new OrganizeCommand().run(process.argv[2], process.argv[3], process.argv[4]);
