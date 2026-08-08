const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildProviderRequest, getProviderConfig } = require("../couple-miniprogram/cloudfunctions/love-agent/provider");

test("OpenAI 官方端点携带匿名 safety_identifier", () => {
  const config = getProviderConfig({
    LOVE_AGENT_API_KEY: "secret",
    LOVE_AGENT_API_BASE: "https://api.openai.com/v1",
    LOVE_AGENT_API_STYLE: "responses",
    LOVE_AGENT_MODEL: "gpt-5.6-luna"
  });
  const body = buildProviderRequest({
    config,
    instructions: "约束",
    input: "问题",
    safetyIdentifier: "a".repeat(64)
  });
  assert.equal(body.safety_identifier, "a".repeat(64));
});

test("兼容网关不自动附加 OpenAI 专有 safety_identifier", () => {
  const config = getProviderConfig({
    LOVE_AGENT_API_KEY: "secret",
    LOVE_AGENT_API_BASE: "https://gateway.example.com/v1",
    LOVE_AGENT_API_STYLE: "chat_completions",
    LOVE_AGENT_MODEL: "compatible-model"
  });
  const body = buildProviderRequest({
    config,
    instructions: "约束",
    input: "问题",
    safetyIdentifier: "anonymous-id"
  });
  assert.equal(Object.prototype.hasOwnProperty.call(body, "safety_identifier"), false);
});

test("云函数只发送哈希后的匿名标识而不是原始 OpenID", () => {
  const source = fs.readFileSync(path.resolve(
    __dirname,
    "../couple-miniprogram/cloudfunctions/love-agent/index.js"
  ), "utf8");
  assert.match(source, /createHash\("sha256"\).*lovetry-agent/);
  assert.match(source, /safetyIdentifier: safetyIdentifier\(openid\)/);
});
