const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const projectRoot = path.join(root, "couple-miniprogram");
const miniprogramRoot = path.join(projectRoot, "miniprogram");
const cloudRoot = path.join(projectRoot, "cloudfunctions");
const failures = [];

function walk(directory, predicate) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(target, predicate);
    return predicate(target) ? [target] : [];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function requireFile(file, label) {
  if (!fs.existsSync(file)) failures.push(`${label}: ${relative(file)}`);
}

for (const file of walk(root, (target) => target.endsWith(".js"))) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) failures.push(`JS 语法: ${relative(file)}\n${check.stderr.trim()}`);
}

for (const file of walk(root, (target) => target.endsWith(".json"))) {
  try { JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { failures.push(`JSON 语法: ${relative(file)} (${error.message})`); }
}

const appConfig = JSON.parse(fs.readFileSync(path.join(miniprogramRoot, "app.json"), "utf8"));
const pages = [
  ...(appConfig.pages || []),
  ...(appConfig.subpackages || []).flatMap((group) => (group.pages || []).map((page) => `${group.root}/${page}`))
];
for (const page of pages) {
  for (const extension of ["js", "json", "wxml", "wxss"]) {
    requireFile(path.join(miniprogramRoot, `${page}.${extension}`), `页面缺少 ${extension}`);
  }
  const configFile = path.join(miniprogramRoot, `${page}.json`);
  if (!fs.existsSync(configFile)) continue;
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  for (const component of Object.values(config.usingComponents || {})) {
    if (!component.startsWith("/")) continue;
    for (const extension of ["js", "json", "wxml", "wxss"]) {
      requireFile(path.join(miniprogramRoot, `${component.slice(1)}.${extension}`), `组件缺少 ${extension}`);
    }
  }
}

const functions = fs.readdirSync(cloudRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
for (const entry of functions) {
  requireFile(path.join(cloudRoot, entry.name, "index.js"), "云函数缺少入口");
  requireFile(path.join(cloudRoot, entry.name, "package.json"), "云函数缺少依赖声明");
  requireFile(path.join(cloudRoot, entry.name, "package-lock.json"), "云函数缺少锁文件");
}

const directCloudCalls = walk(miniprogramRoot, (target) => target.endsWith(".js"))
  .filter((file) => !file.endsWith(path.join("services", "cloudApi.js")))
  .filter((file) => fs.readFileSync(file, "utf8").includes("wx.cloud.callFunction"));
if (directCloudCalls.length) failures.push(`页面绕过服务层调用云函数: ${directCloudCalls.map(relative).join(", ")}`);

const subpackageRoots = new Set((appConfig.subpackages || []).map((group) => path.join(miniprogramRoot, group.root)));
const mainPackageFiles = walk(miniprogramRoot, () => true)
  .filter((file) => ![...subpackageRoots].some((subpackageRoot) => file.startsWith(`${subpackageRoot}${path.sep}`)));
const mainPackageBytes = mainPackageFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const internalMainPackageBudget = 1024 * 1024;
if (mainPackageBytes > internalMainPackageBudget) {
  failures.push(`主包源码超过内部 1 MiB 预算: ${(mainPackageBytes / 1024).toFixed(1)} KiB`);
}

const tappableNonControls = walk(miniprogramRoot, (target) => target.endsWith(".wxml"))
  .flatMap((file) => {
    const matches = fs.readFileSync(file, "utf8").match(/<(view|text)\b[^>]*\bbindtap=/g) || [];
    return matches.map(() => relative(file));
  })
  .filter((file) => !file.endsWith("components/confirm-dialog/confirm-dialog.wxml"));
if (tappableNonControls.length) {
  failures.push(`可点击区域应优先使用 button: ${[...new Set(tappableNonControls)].join(", ")}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`验证通过：${pages.length} 个页面、${functions.length} 个云函数、${walk(root, (target) => target.endsWith(".js")).length} 个 JS 文件；主包源码 ${(mainPackageBytes / 1024).toFixed(1)} KiB。`);
