const test = require("node:test");
const assert = require("node:assert/strict");

const { validateRecordInput } = require("../couple-miniprogram/shared");

test("有效记录会被规范化为可持久化的数据", () => {
  const result = validateRecordInput({
    type: "mood",
    title: "  今天很开心  ",
    content: "  一起散步  ",
    visibility: "couple"
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      type: "mood",
      title: "今天很开心",
      content: "一起散步",
      visibility: "couple"
    }
  });
});

test("不支持的记录类型会返回可识别错误", () => {
  assert.deepEqual(
    validateRecordInput({ type: "unknown", title: "标题" }),
    {
      ok: false,
      error: { code: "INVALID_RECORD", message: "记录类型无效" }
    }
  );
});

test("敏感记录未指定可见性时默认仅本人可见", () => {
  const result = validateRecordInput({
    type: "sleep",
    title: "昨晚睡眠"
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.visibility, "private");
});
