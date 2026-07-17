const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyFormTemplate,
  createDraftRepository,
  templatesFor
} = require("../couple-miniprogram/shared/form-assist");

function memoryAdapter() {
  const data = new Map();
  return {
    get(key) { return data.get(key); },
    set(key, value) { data.set(key, value); },
    remove(key) { data.delete(key); }
  };
}

test("表单草稿可以恢复并在过期后自动清理", () => {
  let now = Date.parse("2026-07-17T10:00:00Z");
  const drafts = createDraftRepository(memoryAdapter(), {
    now: () => now,
    maxAgeMs: 1000
  });
  drafts.save("record:mood", { title: "今天有点累", visibility: "private" });
  assert.deepEqual(drafts.load("record:mood"), {
    data: { title: "今天有点累", visibility: "private" },
    savedAt: now
  });

  now += 1001;
  assert.equal(drafts.load("record:mood"), null);
});

test("快速模板只补充当前类型字段且不修改原表单", () => {
  const original = { title: "", content: "", visibility: "private" };
  const templates = templatesFor("record", "conflict");
  const next = applyFormTemplate(original, templates, "gentle-review");
  assert.equal(original.title, "");
  assert.equal(next.visibility, "private");
  assert.match(next.content, /观察到的事实/);
  assert.match(next.agreement, /下一步/);
});
