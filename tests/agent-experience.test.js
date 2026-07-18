const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyPromptFrame,
  promptFrames,
  providerPresentation
} = require("../couple-miniprogram/shared/agent-experience");

test("恋爱助手用用户语言呈现模型状态且不暴露协议细节", () => {
  const connected = providerPresentation({ configured: true, connection: "connected", model: "gpt-5.6-luna", style: "responses" });
  assert.deepEqual(connected, {
    tone: "ok",
    title: "增强回答已连接",
    detail: "回答会结合本地知识条目，仍可能出现理解偏差",
    canProbe: true
  });
  assert.doesNotMatch(JSON.stringify(connected), /gpt-|Responses|Completions/i);

  const fallback = providerPresentation({ configured: true, connection: "timeout" });
  assert.equal(fallback.title, "已切换到本地知识库");
  assert.equal(fallback.tone, "notice");
});

test("结构化提问模板帮助区分事实、感受和期待且不覆盖已有输入", () => {
  const frames = promptFrames();
  const question = applyPromptFrame("", frames[0].id);
  assert.match(question, /可观察到的事实/);
  assert.match(question, /我的感受/);
  assert.match(question, /我希望/);
  assert.equal(applyPromptFrame("我已经写了一段", frames[0].id), "我已经写了一段");
});
