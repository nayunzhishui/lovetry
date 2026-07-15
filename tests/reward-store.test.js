const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeRewardItem, transitionInventory, DomainError } = require("../couple-miniprogram/shared");

test("奖励商品会规范化名称、积分和状态", () => {
  assert.deepEqual(normalizeRewardItem({ title: "  电影选择权 ", points: "30" }), {
    title: "电影选择权",
    detail: "",
    points: 30,
    status: "active"
  });
});

test("仓库条目只能按待兑现、可使用、已使用顺序推进", () => {
  assert.equal(transitionInventory("pending", "ready"), "ready");
  assert.equal(transitionInventory("ready", "used"), "used");
  assert.throws(() => transitionInventory("pending", "used"), (error) => error instanceof DomainError && error.code === "INVALID_REWARD_STATE");
});
