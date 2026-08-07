const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "couple-miniprogram", "shared");
const runtimeRoot = path.join(root, "couple-miniprogram", "miniprogram", "shared");
const cloudRoot = path.join(root, "couple-miniprogram", "cloudfunctions");
const membershipSource = path.join(cloudRoot, "_shared", "membership.js");
const membershipTargets = ["couple", "records", "plans", "rewards", "media", "dashboard", "notifications"];

fs.mkdirSync(runtimeRoot, { recursive: true });

const sourceFiles = fs.readdirSync(sourceRoot)
  .filter((name) => name.endsWith(".js"))
  .sort();

for (const name of sourceFiles) {
  fs.copyFileSync(path.join(sourceRoot, name), path.join(runtimeRoot, name));
}

for (const name of fs.readdirSync(runtimeRoot)) {
  if (name.endsWith(".js") && !sourceFiles.includes(name)) {
    fs.rmSync(path.join(runtimeRoot, name));
  }
}

for (const target of membershipTargets) {
  fs.copyFileSync(membershipSource, path.join(cloudRoot, target, "membership.js"));
}

console.log(`已同步 ${sourceFiles.length} 个共享模块到小程序运行时目录。`);
console.log(`已同步 membership resolver 到 ${membershipTargets.length} 个云函数目录。`);
