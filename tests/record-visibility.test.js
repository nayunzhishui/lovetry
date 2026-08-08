const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeVisibility } = require("../couple-miniprogram/cloudfunctions/records/visibility");

test("创建时缺省可见性回落到类型默认值", () => {
  assert.equal(normalizeVisibility("mood"), "private");
  assert.equal(normalizeVisibility("moment"), "couple");
});

test("显式传入的可见性总是生效", () => {
  assert.equal(normalizeVisibility("moment", "private"), "private");
  assert.equal(normalizeVisibility("mood", "couple", "private"), "couple");
});

test("更新时缺省可见性保留现有值，不会翻转私密记录", () => {
  // 一条被显式设为 private 的 moment，不带 visibility 的 update 不能变回 couple
  assert.equal(normalizeVisibility("moment", undefined, "private"), "private");
  // 反向：共享记录不会被悄悄变成私密
  assert.equal(normalizeVisibility("mood", undefined, "couple"), "couple");
});

test("现有值非法时仍回落到类型默认值", () => {
  assert.equal(normalizeVisibility("moment", undefined, "everyone"), "couple");
  assert.equal(normalizeVisibility("period", null, ""), "private");
});
