const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("媒体云函数声明每日清理触发器且只在无用户上下文的计时事件执行", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "couple-miniprogram/cloudfunctions/media/config.json"), "utf8"));
  assert.equal(config.triggers.length, 1);
  assert.equal(config.triggers[0].type, "timer");
  assert.match(config.triggers[0].config, /^\S+( \S+){6}$/);
  const source = fs.readFileSync(path.join(root, "couple-miniprogram/cloudfunctions/media/index.js"), "utf8");
  assert.match(source, /!OPENID && event && event\.Type && event\.Time/);
  assert.match(source, /pendingDeletion: true/);
});

test("verify 不把以下划线开头的云函数内部目录当成部署函数", () => {
  const source = fs.readFileSync(path.join(root, "scripts/verify-project.js"), "utf8");
  assert.match(source, /!entry\.name\.startsWith\("_"\)/);
});
