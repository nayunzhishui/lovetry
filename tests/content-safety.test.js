const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("奖励体验明确双方自愿和不可交换的关系边界", () => {
  const account = read("couple-miniprogram/miniprogram/pages/rewards/rewards.wxml");
  const store = read("couple-miniprogram/miniprogram/features/reward-store/reward-store.wxml");
  assert.match(account, /双方自愿/);
  assert.match(account, /隐私、身体接触、道歉或控制权/);
  assert.match(store, /任何一方都可以拒绝或调整/);
});

test("微信全局配置不把媒体选择误报为位置隐私接口且沟通入口保持唯一", () => {
  const app = JSON.parse(read("couple-miniprogram/miniprogram/app.json"));
  assert.equal((app.requiredPrivateInfos || []).includes("chooseMedia"), false);
  assert.equal(app.pages.includes("pages/conflict/conflict"), false);
});
