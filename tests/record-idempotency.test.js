const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertRecordRequestCompatible,
  recordRequestFingerprint
} = require("../couple-miniprogram/cloudfunctions/records/idempotency");

function record(overrides = {}) {
  return {
    type: "moment",
    title: "第一次一起做饭",
    content: "番茄炒蛋",
    visibility: "couple",
    startAt: new Date("2026-07-16T12:00:00.000Z"),
    endAt: null,
    metrics: {},
    payload: { tags: ["生活"] },
    relatedPlanId: "",
    isTest: false,
    ownerOpenid: "user-a",
    ...overrides
  };
}

test("同一幂等请求允许字段顺序不同但内容相同的重试", () => {
  const requested = record({ payload: { note: "ok", tags: ["生活"] } });
  const existing = {
    ...record({ payload: { tags: ["生活"], note: "ok" } }),
    requestFingerprint: recordRequestFingerprint(requested)
  };
  assert.equal(assertRecordRequestCompatible(existing, requested), existing);
});

test("同一幂等标识对应不同内容时拒绝覆盖", () => {
  const existing = record();
  assert.throws(
    () => assertRecordRequestCompatible(existing, record({ content: "另一份内容" })),
    (error) => error.code === "IDEMPOTENCY_CONFLICT"
  );
});
