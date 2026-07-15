const test = require("node:test");
const assert = require("node:assert/strict");

const { validateBackupEnvelope } = require("../couple-miniprogram/cloudfunctions/dashboard/backup");

function createBackup(overrides = {}) {
  return {
    schemaVersion: 1,
    couple: { _id: "couple-a" },
    records: [{ _id: "record-1" }],
    plans: [{ _id: "plan-1" }],
    truncated: { records: false, plans: false, albums: false, mediaAssets: false },
    ...overrides
  };
}

test("恢复前拒绝其他情侣空间的备份", () => {
  assert.throws(
    () => validateBackupEnvelope(createBackup(), "couple-b"),
    (error) => error.code === "INVALID_BACKUP"
  );
});

test("恢复前拒绝已截断的不完整备份", () => {
  assert.throws(
    () => validateBackupEnvelope(
      createBackup({ truncated: { records: true, plans: false, albums: false, mediaAssets: false } }),
      "couple-a"
    ),
    (error) => error.code === "TRUNCATED_BACKUP"
  );
});

test("合法备份仅返回可恢复集合并限制数量", () => {
  const backup = createBackup({
    records: Array.from({ length: 501 }, (_, index) => ({ _id: `record-${index}` })),
    plans: Array.from({ length: 501 }, (_, index) => ({ _id: `plan-${index}` }))
  });
  const result = validateBackupEnvelope(backup, "couple-a");
  assert.equal(result.records.length, 500);
  assert.equal(result.plans.length, 500);
});
