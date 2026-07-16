const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertVersion,
  markDeleted,
  setStatus,
  toggleChecklist
} = require("../couple-miniprogram/cloudfunctions/plans/mutations");

test("计划快捷更新统一递增版本并保留其余字段", () => {
  const now = new Date("2026-07-16T08:00:00.000Z");
  const current = {
    _id: "plan-a",
    title: "收拾行李",
    status: "todo",
    version: 4,
    payload: { checklist: [{ title: "证件", done: false }] }
  };
  const completed = setStatus(current, "done", now);
  const checked = toggleChecklist(current, 0, now);
  const deleted = markDeleted(current, now);

  assert.equal(completed.version, 5);
  assert.equal(completed.completedAt, now);
  assert.equal(checked.version, 5);
  assert.equal(checked.payload.checklist[0].done, true);
  assert.equal(deleted.version, 5);
  assert.equal(deleted.deletedAt, now);
});

test("过期计划版本会被拒绝", () => {
  assert.throws(
    () => assertVersion({ version: 3 }, 2),
    (error) => error.code === "VERSION_CONFLICT"
  );
  assert.doesNotThrow(() => assertVersion({ version: 3 }, 3));
});
