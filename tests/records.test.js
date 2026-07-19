const test = require("node:test");
const assert = require("node:assert/strict");

const { validateRecordInput } = require("../couple-miniprogram/shared");
const { recordIdForRequest } = require("../couple-miniprogram/cloudfunctions/records/idempotency");

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

test("心情、吵架和睡眠记录未指定可见性时默认仅本人可见", () => {
  for (const type of ["mood", "conflict", "sleep"]) {
    const result = validateRecordInput({ type, title: "敏感记录" });
    assert.equal(result.ok, true);
    assert.equal(result.data.visibility, "private");
  }
});

test("生理期和亲密记录默认仅本人可见", () => {
  for (const type of ["period", "intimacy"]) {
    const result = validateRecordInput({ type, title: "身体记录" });
    assert.equal(result.ok, true);
    assert.equal(result.data.visibility, "private");
  }
});

test("同一次番茄专注的请求 ID 始终映射到同一记录", () => {
  const requestId = "pomodoro:2026-07-15T08:00:00.000Z";
  const first = recordIdForRequest("couple-a", "user-a", requestId);
  const repeated = recordIdForRequest("couple-a", "user-a", requestId);
  const otherSession = recordIdForRequest("couple-a", "user-a", `${requestId}:next`);
  assert.equal(first, repeated);
  assert.notEqual(first, otherSession);
});
