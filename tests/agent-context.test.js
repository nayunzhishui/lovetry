const test = require("node:test");
const assert = require("node:assert/strict");

const {
  contextCandidate,
  contextPayload,
  createHandoffRepository,
  handoffToConflictPatch
} = require("../couple-miniprogram/shared/agent-context");

test("只允许用户主动选择自己的非健康记录作为临时上下文", () => {
  const own = contextCandidate({
    _id: "r1", ownerOpenid: "me", type: "conflict", title: "昨晚的沟通",
    content: "我们因为回消息速度有分歧", startAt: "2026-07-18T10:00:00.000Z"
  }, "me");
  assert.equal(own.typeLabel, "沟通复盘");
  assert.match(own.preview, /回消息速度/);
  assert.equal(contextCandidate({ _id: "r2", ownerOpenid: "partner", type: "mood", content: "伴侣记录" }, "me"), null);
  assert.equal(contextCandidate({ _id: "r3", ownerOpenid: "me", type: "period", content: "健康记录" }, "me"), null);
});

test("发送给 Agent 的上下文只包含可见预览且限制长度", () => {
  const candidate = contextCandidate({ _id: "r1", ownerOpenid: "me", type: "mood", title: "心情", content: "难过".repeat(300) }, "me");
  const payload = contextPayload(candidate);
  assert.deepEqual(Object.keys(payload), ["type", "label", "content"]);
  assert.ok(payload.content.length <= 400);
  assert.doesNotMatch(JSON.stringify(payload), /ownerOpenid|r1/);
});

test("AI 建议通过短期交接进入私密沟通草稿且不会直接共享", () => {
  const storage = new Map();
  let now = 1000;
  const repository = createHandoffRepository({
    get: (key) => storage.get(key),
    set: (key, value) => storage.set(key, value),
    remove: (key) => storage.delete(key)
  }, { now: () => now });
  repository.save({ question: "怎么重新开口", answer: "先描述事实，再表达感受。" });
  const patch = handoffToConflictPatch(repository.load());
  assert.equal(patch.visibility, "private");
  assert.match(patch.communication, /AI 建议草稿/);
  assert.ok(patch.communication.length <= 800);
  now += 31 * 60 * 1000;
  assert.equal(repository.load(), null);
});
