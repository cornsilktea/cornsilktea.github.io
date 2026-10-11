const fs = require("fs");
const [templatePath, dataPath, outPath] = process.argv.slice(2);
if (!templatePath || !dataPath || !outPath) throw new Error("사용법: node 원격보고서-만들기.js 템플릿.html 자료.json 결과.html");
const template = fs.readFileSync(templatePath, "utf8");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
if (!template.includes("__DATA__")) throw new Error("앵커 없음");
const page = template.replace("__DATA__", () => JSON.stringify(data));
fs.writeFileSync(outPath, page, "utf8");
console.log("ok", page.length);
