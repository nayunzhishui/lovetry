const http = require("http");
const https = require("https");

const API_STYLES = new Set(["responses", "chat_completions"]);

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function extractOutputText(response) {
  if (response && typeof response.output_text === "string") return response.output_text.trim();
  return (response && Array.isArray(response.output) ? response.output : [])
    .flatMap((item) => Array.isArray(item && item.content) ? item.content : [])
    .filter((item) => item && item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function extractChatCompletionText(response) {
  const content = response && response.choices && response.choices[0]
    && response.choices[0].message && response.choices[0].message.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item && (item.type === "text" || item.type === "output_text"))
    .map((item) => String(item.text || ""))
    .join("\n")
    .trim();
}

function getProviderConfig(env = process.env) {
  const style = String(env.LOVE_AGENT_API_STYLE || "responses").trim().toLowerCase();
  if (!API_STYLES.has(style)) {
    const error = new Error("LOVE_AGENT_API_STYLE must be responses or chat_completions");
    error.code = "MODEL_INVALID_CONFIG";
    throw error;
  }
  const chatTokenField = String(env.LOVE_AGENT_CHAT_TOKEN_FIELD || "max_tokens").trim();
  if (!["max_tokens", "max_completion_tokens"].includes(chatTokenField)) {
    const error = new Error("LOVE_AGENT_CHAT_TOKEN_FIELD is invalid");
    error.code = "MODEL_INVALID_CONFIG";
    throw error;
  }

  const baseUrl = String(env.LOVE_AGENT_API_BASE || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  const endpointPath = String(env.LOVE_AGENT_API_PATH || (
    style === "responses" ? "/responses" : "/chat/completions"
  )).trim();
  const endpointUrl = new URL(endpointPath.startsWith("/") ? `${baseUrl}${endpointPath}` : `${baseUrl}/${endpointPath}`);
  if (endpointUrl.username || endpointUrl.password) {
    const error = new Error("API URL must not contain credentials");
    error.code = "MODEL_INVALID_CONFIG";
    throw error;
  }
  const allowInsecureHttp = String(env.LOVE_AGENT_ALLOW_INSECURE_HTTP || "").toLowerCase() === "true";
  if (endpointUrl.protocol !== "https:" && !(endpointUrl.protocol === "http:" && allowInsecureHttp)) {
    const error = new Error("API URL must use HTTPS");
    error.code = "MODEL_INVALID_CONFIG";
    throw error;
  }

  return {
    apiKey: String(env.LOVE_AGENT_API_KEY || env.OPENAI_API_KEY || "").trim(),
    style,
    chatTokenField,
    endpointUrl: endpointUrl.toString(),
    model: String(env.LOVE_AGENT_MODEL || "gpt-5.6-luna").trim(),
    timeoutMs: boundedInteger(env.LOVE_AGENT_TIMEOUT_MS, 12000, 3000, 30000),
    maxOutputTokens: boundedInteger(env.LOVE_AGENT_MAX_OUTPUT_TOKENS, 900, 64, 2000)
  };
}

function getProviderStatus(config = getProviderConfig()) {
  return {
    configured: Boolean(config.apiKey && config.model),
    style: config.style,
    model: config.model,
    host: new URL(config.endpointUrl).host
  };
}

function buildProviderRequest({ config, instructions, input }) {
  if (config.style === "chat_completions") {
    return {
      model: config.model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input }
      ],
      [config.chatTokenField || "max_tokens"]: config.maxOutputTokens
    };
  }
  return {
    model: config.model,
    instructions,
    input,
    max_output_tokens: config.maxOutputTokens,
    store: false
  };
}

function requestJson(url, apiKey, body, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "http:" ? http : target.protocol === "https:" ? https : null;
    if (!transport) return reject(new Error("MODEL_INVALID_PROTOCOL"));
    const request = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: timeoutMs
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        let parsed;
        try { parsed = raw ? JSON.parse(raw) : {}; }
        catch (error) { return reject(new Error("MODEL_INVALID_RESPONSE")); }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error("MODEL_REQUEST_FAILED");
          error.code = "MODEL_REQUEST_FAILED";
          error.statusCode = response.statusCode;
          return reject(error);
        }
        return resolve(parsed);
      });
    });
    request.on("timeout", () => request.destroy(new Error("MODEL_TIMEOUT")));
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}

async function generateAnswer({ instructions, input }, env = process.env) {
  const config = getProviderConfig(env);
  if (!config.apiKey) return null;
  const response = await requestJson(
    config.endpointUrl,
    config.apiKey,
    buildProviderRequest({ config, instructions, input }),
    config.timeoutMs
  );
  const answer = config.style === "chat_completions"
    ? extractChatCompletionText(response)
    : extractOutputText(response);
  if (!answer) throw new Error("MODEL_EMPTY_RESPONSE");
  return { answer, model: config.model, responseId: response.id || "" };
}

module.exports = {
  buildProviderRequest,
  extractChatCompletionText,
  extractOutputText,
  generateAnswer,
  getProviderConfig,
  getProviderStatus,
  requestJson
};
