const test = require("node:test");
const assert = require("node:assert/strict");
const { batchEnd, normalizeRestoreJob, restoreBatchId } = require("../couple-miniprogram/cloudfunctions/dashboard/restore-checkpoint");

test("相同恢复内容生成稳定批次 ID 且字段顺序不影响", () => {
  const first = { records: [{ _id: "r1", title: "A", payload: { b: 2, a: 1 } }], plans: [{ _id: "p1", title: "P" }] };
  const second = { records: [{ payload: { a: 1, b: 2 }, title: "A", _id: "r1" }], plans: [{ title: "P", _id: "p1" }] };
  assert.equal(restoreBatchId("c1", "u1", first), restoreBatchId("c1", "u1", second));
});

test("同一条目 ID 内容被修改时不会错误复用旧恢复批次", () => {
  const first = { records: [{ _id: "r1", title: "原内容" }], plans: [] };
  const changed = { records: [{ _id: "r1", title: "已修改" }], plans: [] };
  assert.notEqual(restoreBatchId("c1", "u1", first), restoreBatchId("c1", "u1", changed));
});

test("恢复检查点限制索引并正确判断是否完成", () => {
  const recovery = { records: Array.from({ length: 40 }, (_, i) => ({ _id: `r${i}` })), plans: [{ _id: "p1" }] };
  assert.equal(batchEnd(0, recovery.records.length), 25);
  assert.equal(batchEnd(25, recovery.records.length), 40);
  const running = normalizeRestoreJob({ recordIndex: 25, planIndex: 1, counts: { records: 24, skipped: 1 } }, recovery);
  assert.equal(running.hasMore, true);
  assert.equal(running.status, "running");
  const completed = normalizeRestoreJob({ recordIndex: 99, planIndex: 99, counts: { records: 40, plans: 1 } }, recovery);
  assert.equal(completed.hasMore, false);
  assert.equal(completed.status, "completed");
});
