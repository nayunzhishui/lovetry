const https = require("https");

function extractOutputText(response) {
  if (response && typeof response.output_text === "string") return response.output_text.trim();
  return (response && Array.isArray(response.output) ? response.output : [])
    .flatMap((item) => Array.isArray(item && item.content) ? item.content : [])
    .filter((item) => item && item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function requestJson(url, apiKey, body, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
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
          const error = new Error(parsed.error && parsed.error.message || "MODEL_REQUEST_FAILED");
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

async function generateAnswer({ instructions, input }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  const baseUrl = String(process.env.LOVE_AGENT_API_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = String(process.env.LOVE_AGENT_MODEL || "gpt-5.6-luna").trim();
  const response = await requestJson(`${baseUrl}/responses`, apiKey, {
    model,
    instructions,
    input,
    max_output_tokens: 900,
    store: false
  });
  const answer = extractOutputText(response);
  if (!answer) throw new Error("MODEL_EMPTY_RESPONSE");
  return { answer, model, responseId: response.id || "" };
}

module.exports = { extractOutputText, generateAnswer, requestJson };
