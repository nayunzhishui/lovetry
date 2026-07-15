const test = require("node:test");
const assert = require("node:assert/strict");

const { createBackupManifest, verifyBackupManifest } = require("../couple-miniprogram/shared/backup-manifest");

test("版本 2 备份摘要不受对象字段顺序影响", () => {
  const first = createBackupManifest({ plans: [{ title: "旅行", id: "p1" }], records: [] });
  const second = createBackupManifest({ records: [], plans: [{ id: "p1", title: "旅行" }] });
  assert.equal(first.checksum, second.checksum);
  assert.equal(first.schemaVersion, 2);
});

test("备份内容被修改后摘要校验失败", () => {
  const manifest = createBackupManifest({ records: [{ id: "r1", title: "原内容" }] });
  assert.equal(verifyBackupManifest({ ...manifest, payload: { records: [{ id: "r1", title: "被修改" }] } }), false);
});
