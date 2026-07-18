const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { fallbackAnswer } = require("../couple-miniprogram/cloudfunctions/love-agent/fallback");
const { agentQueryText, buildInput, buildInstructions, normalizeHistory, normalizeSelectedContext, sanitizeCitations } = require("../couple-miniprogram/cloudfunctions/love-agent/prompt");
const {
  buildProviderRequest,
  extractChatCompletionText,
  extractOutputText,
  generateAnswer,
  getProviderConfig,
  getProviderStatus
} = require("../couple-miniprogram/cloudfunctions/love-agent/provider");
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
  assert.equal(assessRisk("他逼我发生性关系，还威胁我不能离开"), "immediate_danger");
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

test("只有经过限制的显式上下文会进入本次模型输入", () => {
  const context = normalizeSelectedContext({ type: "conflict", label: "昨晚沟通", content: "我们因为回消息速度有分歧" });
  assert.deepEqual(context, { type: "conflict", label: "昨晚沟通", content: "我们因为回消息速度有分歧" });
  assert.match(buildInput("怎么开口", [], "[K01] 沟通", context), /用户主动选择的临时记录/);
  assert.equal(normalizeSelectedContext({ type: "period", label: "健康记录", content: "内容" }), null);
});

test("临时记录中的危险信息同样进入安全分流", () => {
  const context = normalizeSelectedContext({ type: "conflict", label: "昨晚", content: "他掐我脖子还把门锁上" });
  assert.equal(assessRisk(agentQueryText("我现在该怎么办", context)), "immediate_danger");
});

test("模型不会把单方叙述当作伴侣动机或心理事实", () => {
  const instructions = buildInstructions();
  assert.match(instructions, /区分可观察事实、用户解释和未知信息/);
  assert.match(instructions, /不要迎合或确认对伴侣动机的猜测/);
});

test("Responses API 原始响应可以提取回答文本", () => {
  assert.equal(extractOutputText({
    output: [{
      type: "message",
      content: [{ type: "output_text", text: "先暂停，再约定回来沟通。" }]
    }]
  }), "先暂停，再约定回来沟通。");
});

test("模型适配层支持 Responses 与 Chat Completions 两种兼容协议", () => {
  const responses = buildProviderRequest({
    config: { style: "responses", model: "model-r", maxOutputTokens: 500 },
    instructions: "系统约束",
    input: "用户问题"
  });
  assert.deepEqual(responses, {
    model: "model-r",
    instructions: "系统约束",
    input: "用户问题",
    max_output_tokens: 500,
    store: false
  });

  const chat = buildProviderRequest({
    config: { style: "chat_completions", model: "model-c", maxOutputTokens: 300 },
    instructions: "系统约束",
    input: "用户问题"
  });
  assert.deepEqual(chat, {
    model: "model-c",
    messages: [
      { role: "system", content: "系统约束" },
      { role: "user", content: "用户问题" }
    ],
    max_tokens: 300
  });
  assert.equal(extractChatCompletionText({
    choices: [{ message: { content: "先确认感受，再讨论具体请求。" } }]
  }), "先确认感受，再讨论具体请求。");
});

test("模型配置支持通用 API 密钥且状态不泄露密钥和完整地址", () => {
  const config = getProviderConfig({
    LOVE_AGENT_API_KEY: "secret-value",
    LOVE_AGENT_API_STYLE: "chat_completions",
    LOVE_AGENT_API_BASE: "https://gateway.example.com/v1/",
    LOVE_AGENT_MODEL: "compatible-model",
    LOVE_AGENT_TIMEOUT_MS: "8000"
  });
  assert.equal(config.apiKey, "secret-value");
  assert.equal(config.endpointUrl, "https://gateway.example.com/v1/chat/completions");
  assert.deepEqual(getProviderStatus(config), {
    configured: true,
    style: "chat_completions",
    model: "compatible-model",
    host: "gateway.example.com"
  });
  assert.doesNotMatch(JSON.stringify(getProviderStatus(config)), /secret-value|\/v1/);
});

test("Chat Completions 可切换新模型的输出令牌字段", () => {
  const config = getProviderConfig({
    LOVE_AGENT_API_KEY: "secret-value",
    LOVE_AGENT_API_STYLE: "chat_completions",
    LOVE_AGENT_CHAT_TOKEN_FIELD: "max_completion_tokens"
  });
  const body = buildProviderRequest({ config, instructions: "约束", input: "问题" });
  assert.equal(body.max_completion_tokens, 900);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "max_tokens"), false);
});

test("模型适配层可以调用 OpenAI 兼容 API 并携带服务端密钥", async () => {
  let received = null;
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      received = {
        authorization: request.headers.authorization,
        path: request.url,
        body: JSON.parse(raw)
      };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: "chatcmpl-local",
        choices: [{ message: { content: "连接成功" } }]
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const result = await generateAnswer({ instructions: "约束", input: "测试" }, {
      LOVE_AGENT_API_KEY: "server-only-key",
      LOVE_AGENT_API_STYLE: "chat_completions",
      LOVE_AGENT_API_BASE: `http://127.0.0.1:${address.port}/v1`,
      LOVE_AGENT_ALLOW_INSECURE_HTTP: "true",
      LOVE_AGENT_MODEL: "local-model"
    });
    assert.deepEqual(result, {
      answer: "连接成功",
      model: "local-model",
      responseId: "chatcmpl-local"
    });
    assert.equal(received.authorization, "Bearer server-only-key");
    assert.equal(received.path, "/v1/chat/completions");
    assert.equal(received.body.messages[1].content, "测试");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("模型不能引用本次检索范围之外的知识条目", () => {
  assert.equal(
    sanitizeCitations("先暂停 [K02]，再读取不存在的资料 [K99]。", ["K02"]),
    "先暂停 [K02]，再读取不存在的资料 。"
  );
});
