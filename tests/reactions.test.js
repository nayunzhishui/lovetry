const test = require("node:test");
const assert = require("node:assert/strict");

const { validateReactionRequest, toggleReaction, DomainError } = require("../couple-miniprogram/shared");

test("同一用户重复点击同一回应会取消且不会累计刷数", () => {
  const added = toggleReaction({}, "user-a", "hug");
  assert.deepEqual(added, { "user-a": "hug" });
  assert.deepEqual(toggleReaction(added, "user-a", "hug"), {});
});

test("轻回应只接受克制的固定集合", () => {
  assert.throws(() => toggleReaction({}, "user-a", "rank"), (error) => error instanceof DomainError && error.code === "INVALID_REACTION");
});

test("同一幂等键不能换到另一条记录或另一种回应", () => {
  const request = { recordId: "record-a", reaction: "hug", record: { _id: "record-a" } };
  assert.deepEqual(validateReactionRequest(request, "record-a", "hug"), request.record);
  assert.throws(
    () => validateReactionRequest(request, "record-b", "seen"),
    (error) => error instanceof DomainError && error.code === "IDEMPOTENCY_CONFLICT"
  );
});
