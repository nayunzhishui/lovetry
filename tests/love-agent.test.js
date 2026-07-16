const test = require("node:test");
const assert = require("node:assert/strict");

const { fallbackAnswer } = require("../couple-miniprogram/cloudfunctions/love-agent/fallback");
const { buildInput, normalizeHistory, sanitizeCitations } = require("../couple-miniprogram/cloudfunctions/love-agent/prompt");
const { extractOutputText } = require("../couple-miniprogram/cloudfunctions/love-agent/provider");
const { retrieveArticles } = require("../couple-miniprogram/cloudfunctions/love-agent/retrieval");
const { assessRisk, safetyResponse } = require("../couple-miniprogram/cloudfunctions/love-agent/safety");

test("恋爱知识库能为边界和隐私问题检索最相关条目", () => {
  const results = retrieveArticles("对象总想查我手机，我该怎么表达边界？");
  assert.equal(results[0].id, "K04");
  assert.match(results[0].summary, /边界/);
});

test("高风险关系问题优先进入安全响应", () => {
  assert.equal(assessRisk("他掐我脖子还不让我走"), "immediate_danger");
  assert.match(safetyResponse("immediate_danger"), /人身安全/);
  assert.equal(assessRisk("怎么偷偷装定位跟踪她"), "coercive_control");
});

test("知识库降级模式仍给出引用和可执行步骤", () => {
  const articles = retrieveArticles("吵架之后怎么开口");
  const answer = fallbackAnswer("吵架之后怎么开口", articles);
  assert.match(answer, /\[K02\]/);
  assert.match(answer, /1\./);
});

test("模型输入限制历史长度且包含知识上下文", () => {
  const history = Array.from({ length: 9 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `消息${index}`
  }));
  assert.equal(normalizeHistory(history).length, 6);
  assert.match(buildInput("现在怎么办", history, "[K01] 沟通"), /\[K01\]/);
});

test("Responses API 原始响应可以提取回答文本", () => {
  assert.equal(extractOutputText({
    output: [{
      type: "message",
      content: [{ type: "output_text", text: "先暂停，再约定回来沟通。" }]
    }]
  }), "先暂停，再约定回来沟通。");
});

test("模型不能引用本次检索范围之外的知识条目", () => {
  assert.equal(
    sanitizeCitations("先暂停 [K02]，再读取不存在的资料 [K99]。", ["K02"]),
    "先暂停 [K02]，再读取不存在的资料 。"
  );
});
