const test = require("node:test");
const assert = require("node:assert/strict");

const { mergeSyncChanges, parseSyncCursor, summarizeSyncChanges, DomainError } = require("../couple-miniprogram/shared");

test("同步游标接受合法 ISO 时间并拒绝未来游标", () => {
  const now = new Date("2026-07-15T10:00:00.000Z");
  assert.equal(parseSyncCursor("2026-07-15T09:59:00.000Z", now).toISOString(), "2026-07-15T09:59:00.000Z");
  assert.throws(() => parseSyncCursor("2026-07-15T11:00:00.000Z", now), (error) => error instanceof DomainError && error.code === "INVALID_SYNC_CURSOR");
});

test("同步摘要只统计实际变更", () => {
  assert.deepEqual(summarizeSyncChanges({ records: [{ _id: "r1" }], plans: [], notifications: [{ _id: "n1" }] }), {
    total: 2,
    records: 1,
    plans: 0,
    notifications: 1
  });
});

test("同步分页结果按类别合并", () => {
  assert.deepEqual(
    mergeSyncChanges(
      { records: [{ _id: "r1" }], plans: [], notifications: [{ _id: "n1" }] },
      { records: [{ _id: "r2" }], plans: [{ _id: "p1" }], notifications: [] }
    ),
    {
      records: [{ _id: "r1" }, { _id: "r2" }],
      plans: [{ _id: "p1" }],
      notifications: [{ _id: "n1" }]
    }
  );
});
