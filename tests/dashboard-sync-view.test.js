const test = require("node:test");
const assert = require("node:assert/strict");

const { projectSyncRecords } = require("../couple-miniprogram/cloudfunctions/dashboard/sync-view");

const ME = "openid-me";
const PARTNER = "openid-partner";

test("已删除记录以瘦墓碑下发，不携带标题正文等内容", () => {
  const deleted = {
    _id: "r1",
    title: "已删除的敏感内容",
    content: "正文",
    visibility: "couple",
    ownerOpenid: PARTNER,
    deletedAt: new Date("2026-07-20T00:00:00Z"),
    updatedAt: new Date("2026-07-20T00:00:00Z")
  };
  const result = projectSyncRecords([deleted], ME);
  assert.equal(result.length, 1);
  assert.deepEqual(Object.keys(result[0]).sort(), ["_id", "deletedAt", "updatedAt"]);
  assert.equal(result[0]._id, "r1");
});

test("未删除记录仍按可见性过滤，伴侣私密记录不下发", () => {
  const records = [
    { _id: "a", visibility: "couple", ownerOpenid: PARTNER, updatedAt: new Date() },
    { _id: "b", visibility: "private", ownerOpenid: PARTNER, updatedAt: new Date() },
    { _id: "c", visibility: "private", ownerOpenid: ME, updatedAt: new Date() }
  ];
  const ids = projectSyncRecords(records, ME).map((record) => record._id);
  assert.deepEqual(ids, ["a", "c"]);
});

test("删除事件不会被可见性过滤吞掉（此前的回归缺陷）", () => {
  const records = [
    { _id: "gone", visibility: "couple", ownerOpenid: PARTNER, deletedAt: new Date(), updatedAt: new Date() }
  ];
  const result = projectSyncRecords(records, ME);
  assert.equal(result.length, 1);
  assert.ok(result[0].deletedAt);
});
