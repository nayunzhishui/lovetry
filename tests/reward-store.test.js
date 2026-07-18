const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeRewardItem, transitionInventory, transitionRewardItem, DomainError } = require("../couple-miniprogram/shared");
const serverPolicy = require("../couple-miniprogram/cloudfunctions/rewards/reward-policy");

test("奖励商品会规范化名称、积分和状态", () => {
  assert.deepEqual(normalizeRewardItem({ title: "  电影选择权 ", points: "30" }), {
    title: "电影选择权",
    detail: "",
    points: 30,
    status: "proposed"
  });
});

test("涉及隐私、身体接触、道歉或控制的奖励会被拒绝", () => {
  for (const title of ["查看手机券", "亲吻兑换券", "强制道歉券", "听话一天券"]) {
    assert.throws(() => normalizeRewardItem({ title, points: 20 }), (error) => error instanceof DomainError && error.code === "UNSAFE_REWARD_ITEM");
  }
});

test("奖励提案只能由伴侣同意或拒绝，创建者可以撤回", () => {
  assert.equal(transitionRewardItem("proposed", "active", "partner"), "active");
  assert.equal(transitionRewardItem("proposed", "rejected", "partner"), "rejected");
  assert.equal(transitionRewardItem("proposed", "archived", "creator"), "archived");
  assert.throws(() => transitionRewardItem("proposed", "active", "creator"), (error) => error instanceof DomainError && error.code === "REWARD_REVIEW_REQUIRED");
});

test("服务端执行同一套敏感奖励和伴侣确认规则", () => {
  assert.equal(serverPolicy.normalizeRewardItem({ title: "早餐券", points: 10 }).status, "proposed");
  assert.throws(() => serverPolicy.normalizeRewardItem({ title: "查看手机券", points: 10 }), (error) => error.code === "UNSAFE_REWARD_ITEM");
  assert.equal(serverPolicy.transitionRewardItem("proposed", "active", "partner"), "active");
});

test("仓库条目只能按待兑现、可使用、已使用顺序推进", () => {
  assert.equal(transitionInventory("pending", "ready"), "ready");
  assert.equal(transitionInventory("ready", "used"), "used");
  assert.throws(() => transitionInventory("pending", "used"), (error) => error instanceof DomainError && error.code === "INVALID_REWARD_STATE");
});
