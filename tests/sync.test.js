const test = require("node:test");
const assert = require("node:assert/strict");

const {
  describeSyncDigest,
  mergeSyncChanges,
  normalizeSyncOffsets,
  parseSyncCursor,
  summarizeSyncChanges,
  DomainError
} = require("../couple-miniprogram/shared");

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

test("同步摘要文案省略零分量并保持中性措辞", () => {
  assert.equal(
    describeSyncDigest({ total: 3, records: 2, plans: 1, notifications: 0 }),
    "有 2 条记录、1 个计划更新"
  );
  assert.equal(describeSyncDigest({ total: 1, records: 0, plans: 0, notifications: 1 }), "有 1 条提醒更新");
  assert.equal(describeSyncDigest({ total: 1, records: 1, plans: 0, notifications: 0 }), "有 1 条记录更新");
});

test("同步摘要文案在全零或缺失时返回空串", () => {
  assert.equal(describeSyncDigest({ total: 0, records: 0, plans: 0, notifications: 0 }), "");
  assert.equal(describeSyncDigest(null), "");
  assert.equal(describeSyncDigest(undefined), "");
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

test("同步分页为各类数据维护独立偏移并去重", () => {
  assert.deepEqual(normalizeSyncOffsets({ records: 200, plans: 3, notifications: -1 }), {
    records: 200,
    plans: 3,
    notifications: 0
  });
  assert.deepEqual(
    mergeSyncChanges(
      { records: [{ _id: "r1", version: 1 }], plans: [], notifications: [] },
      { records: [{ _id: "r1", version: 2 }, { _id: "r2", version: 1 }], plans: [], notifications: [] }
    ).records.map((item) => `${item._id}:${item.version}`),
    ["r1:2", "r2:1"]
  );
});
