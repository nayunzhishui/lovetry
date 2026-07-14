const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyRewardTransaction,
  DomainError
} = require("../couple-miniprogram/shared");

test("获得积分会同时更新余额和累计获得", () => {
  const result = applyRewardTransaction(
    { balance: 10, totalEarned: 10, totalSpent: 0 },
    {
      type: "earn",
      amount: 5,
      sourceType: "task",
      sourceId: "task-1",
      idempotencyKey: "task-1:complete"
    },
    []
  );

  assert.deepEqual(result, {
    applied: true,
    wallet: { balance: 15, totalEarned: 15, totalSpent: 0 },
    transaction: {
      type: "earn",
      amount: 5,
      sourceType: "task",
      sourceId: "task-1",
      idempotencyKey: "task-1:complete"
    }
  });
});

test("相同幂等键重复结算时不再次改变余额", () => {
  const wallet = { balance: 15, totalEarned: 15, totalSpent: 0 };
  const result = applyRewardTransaction(
    wallet,
    {
      type: "earn",
      amount: 5,
      sourceType: "task",
      sourceId: "task-1",
      idempotencyKey: "task-1:complete"
    },
    ["task-1:complete"]
  );

  assert.deepEqual(result, {
    applied: false,
    wallet,
    transaction: null
  });
});

test("消费不会让奖励余额变成负数", () => {
  assert.throws(
    () =>
      applyRewardTransaction(
        { balance: 3, totalEarned: 3, totalSpent: 0 },
        {
          type: "spend",
          amount: 5,
          sourceType: "exchange",
          sourceId: "gift-1",
          idempotencyKey: "gift-1:exchange"
        }
      ),
    (error) =>
      error instanceof DomainError && error.code === "INSUFFICIENT_BALANCE"
  );
});
