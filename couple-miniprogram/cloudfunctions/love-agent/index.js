const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const { fallbackAnswer } = require("./fallback");
const { buildInput, buildInstructions, normalizeHistory, sanitizeCitations } = require("./prompt");
const { generateAnswer, getProviderConfig, getProviderStatus } = require("./provider");
const { knowledgeContext, retrieveArticles, sourcesForClient } = require("./retrieval");
const { assessRisk, safetyResponse } = require("./safety");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ERROR_MESSAGES = {
  INVALID_QUESTION: "请用 2 到 600 个字描述你的问题",
  RATE_LIMITED: "今天的恋爱助手使用次数已达上限，请明天再试",
  UNKNOWN_ACTION: "暂不支持这个操作"
};

function businessError(code) {
  const error = new Error(ERROR_MESSAGES[code] || "操作失败");
  error.code = code;
  return error;
}

function success(data) { return { ok: true, data, ...data }; }
function failure(error) {
  const code = ERROR_MESSAGES[error.code] ? error.code : "INTERNAL_ERROR";
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] || "恋爱助手暂时不可用" } };
}

function usageId(openid, date) {
  return crypto.createHash("sha256").update(`${openid}:${date}`).digest("hex").slice(0, 32);
}

async function consumeDailyQuota(openid) {
  const date = new Date().toISOString().slice(0, 10);
  const id = usageId(openid, date);
  await db.runTransaction(async (transaction) => {
    let current = null;
    try { current = (await transaction.collection("agent_usage").doc(id).get()).data; }
    catch (error) { /* first request today */ }
    const count = Number(current && current.count || 0);
    if (count >= 50) throw businessError("RATE_LIMITED");
    const now = new Date();
    await transaction.collection("agent_usage").doc(id).set({ data: {
      ownerOpenid: openid,
      date,
      count: count + 1,
      createdAt: current && current.createdAt || now,
      updatedAt: now
    } });
  });
}

function inspectProvider() {
  try {
    const config = getProviderConfig();
    return { config, status: getProviderStatus(config) };
  } catch (error) {
    console.error("love-agent provider config invalid", { code: error.code || "MODEL_INVALID_CONFIG" });
    return {
      config: null,
      status: { configured: false, style: "", model: "", host: "", connection: "invalid_configuration" }
    };
  }
}

function providerFailureCode(error) {
  if (error && (error.message === "MODEL_TIMEOUT" || error.code === "ETIMEDOUT")) return "timeout";
  if (error && (error.statusCode === 401 || error.statusCode === 403)) return "authentication_failed";
  if (error && error.statusCode === 404) return "endpoint_not_found";
  if (error && error.statusCode === 429) return "rate_limited";
  return "unavailable";
}

async function handleProviderStatus(event, openid) {
  const inspected = inspectProvider();
  const status = inspected.status;
  if (!status.configured || !event.probe) {
    return success({ ...status, connection: status.connection || (status.configured ? "configured" : "not_configured") });
  }

  await consumeDailyQuota(openid);
  try {
    await generateAnswer({
      instructions: "这是 API 连通性测试。只回复 OK，不要添加其他内容。",
      input: "请回复 OK"
    });
    return success({ ...status, connection: "connected" });
  } catch (error) {
    console.error("love-agent provider probe failed", {
      traceId: event._traceId || "",
      code: error.code || error.message,
      statusCode: error.statusCode || 0
    });
    return success({ ...status, connection: providerFailureCode(error) });
  }
}

async function handle(event, openid) {
  if (event.action === "providerStatus") return handleProviderStatus(event, openid);
  if (event.action !== "ask") throw businessError("UNKNOWN_ACTION");

  const question = String(event.question || "").trim().slice(0, 600);
  if (question.length < 2) throw businessError("INVALID_QUESTION");
  const risk = assessRisk(question);
  const articles = retrieveArticles(question, 4);
  const sources = sourcesForClient(articles);
  if (risk !== "none") {
    return success({
      answer: safetyResponse(risk),
      sources: risk === "immediate_danger" ? sourcesForClient(retrieveArticles("关系安全 暴力 威胁 强迫", 1)) : [],
      mode: "safety",
      memory: "ephemeral"
    });
  }

  const history = normalizeHistory(event.history);
  let generated = null;
  let providerFailed = false;
  const provider = inspectProvider();
  if (provider.status.configured) {
    await consumeDailyQuota(openid);
    try {
      generated = await generateAnswer({
        instructions: buildInstructions(),
        input: buildInput(question, history, knowledgeContext(articles))
      });
    } catch (error) {
      providerFailed = true;
      console.error("love-agent provider failed", {
        traceId: event._traceId || "",
        code: error.code || error.message,
        statusCode: error.statusCode || 0
      });
    }
  }
  const allowedSourceIds = sources.map((source) => source.id);
  return success({
    answer: generated ? sanitizeCitations(generated.answer, allowedSourceIds) : fallbackAnswer(question, articles),
    sources,
    mode: generated ? "ai" : "knowledge",
    model: generated ? generated.model : "",
    providerNotice: providerFailed ? "模型 API 暂时不可用，已切换到本地知识库" : "",
    memory: "ephemeral"
  });
}

exports.main = async (event = {}) => {
  const startedAt = Date.now();
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await handle(event, OPENID);
    console.info("love-agent function completed", {
      traceId: event._traceId || "",
      action: event.action || "",
      mode: result.mode || "",
      code: "OK",
      durationMs: Date.now() - startedAt
    });
    return result;
  } catch (error) {
    console.error("love-agent function failed", {
      traceId: event._traceId || "",
      action: event.action || "",
      code: error.code || error.message,
      durationMs: Date.now() - startedAt
    });
    return failure(error);
  }
};
