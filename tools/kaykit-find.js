const fs = require("fs");
const path = require("path");

class CatalogSearch {
  constructor(catalogPath) {
    this.catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  }

  matches(model, words) {
    const haystack = `${model.name} ${model.category} ${(model.animations || []).map((clip) => clip.name).join(" ")}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  }

  find(words) {
    const found = [];
    for (const pack of this.catalog) {
      for (const model of pack.models) {
        if (this.matches(model, words)) found.push({ pack: pack.pack, model });
      }
    }
    return found;
  }

  describe({ pack, model }) {
    const size = model.size ? model.size.join("x") : "-";
    const extra = model.animations ? ` 클립${model.animations.length}` : "";
    return `${pack} | ${model.file} | ${model.tris}tris | ${size} | ${model.kb}KB${extra}`;
  }
}

class FindCommand {
  run(argumentsList) {
    const words = argumentsList.map((word) => word.toLowerCase());
    if (!words.length) {
      console.log("사용법: node tools/kaykit-find.js 단어 [단어…]   (이름·폴더·애니메이션 클립 이름에서 모든 단어가 들어간 것을 찾음)");
      return;
    }
    const search = new CatalogSearch(path.join(__dirname, "..", "kaykit-catalog", "catalog.json"));
    const found = search.find(words);
    for (const item of found.slice(0, 80)) console.log(search.describe(item));
    console.log(`-- ${found.length}개${found.length > 80 ? " (앞 80개만 표시, 단어를 더 넣어 좁히세요)" : ""}`);
  }
}

new FindCommand().run(process.argv.slice(2));
