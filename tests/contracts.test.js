const test = require("node:test");
const assert = require("node:assert/strict");

const { failure, success } = require("../couple-miniprogram/shared");

test("云函数公共返回契约可由客户端统一识别", () => {
  assert.deepEqual(success({ id: "item-1" }), { ok: true, data: { id: "item-1" } });
  assert.deepEqual(failure("NO_PERMISSION", "无权访问"), {
    ok: false,
    error: { code: "NO_PERMISSION", message: "无权访问" }
  });
});
