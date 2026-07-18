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

test("Agent 上下文与建议落地都保持显式授权和私密优先", () => {
  const agent = read("couple-miniprogram/miniprogram/features/love-agent/love-agent.wxml");
  const agentScript = read("couple-miniprogram/miniprogram/features/love-agent/love-agent.js");
  const recordForm = read("couple-miniprogram/miniprogram/pages/record-form/record-form.wxml");
  assert.match(agent, /仅本次使用 · 由你选择/);
  assert.match(agent, /健康记录和伴侣记录不会出现在这里/);
  assert.match(agentScript, /ownerOnly: true/);
  assert.match(agent, /保存为私密沟通草稿/);
  assert.match(recordForm, /不会自动发给伴侣/);
});

test("奖励由伴侣确认后才能兑换", () => {
  const store = read("couple-miniprogram/miniprogram/features/reward-store/reward-store.wxml");
  assert.match(store, /发给伴侣确认/);
  assert.match(store, /伴侣发来的提案/);
  assert.match(store, /同意/);
  assert.match(store, /暂不接受/);
});
