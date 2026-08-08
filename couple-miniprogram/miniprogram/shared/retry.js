function wait(milliseconds) {
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const DEFAULT_TIMEOUT_MESSAGE = "请求超时，请检查网络后重试";
// 写操作超时时结果未知（服务端可能已落库），必须提示用户先刷新确认，而不是引导直接重试
const WRITE_TIMEOUT_MESSAGE = "请求超时，结果未知，请刷新确认后再重试";

function runWithTimeout(operation, timeoutMs, timeoutMessage) {
  const milliseconds = Math.max(Number(timeoutMs) || 0, 0);
  if (!milliseconds) return Promise.resolve().then(operation);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const message = timeoutMessage || DEFAULT_TIMEOUT_MESSAGE;
      const error = new Error(message);
      error.code = "REQUEST_TIMEOUT";
      // userMessage 会被 cloudApi.normalizeError 原样透传，保证定制文案能到达 UI
      error.userMessage = message;
      reject(error);
    }, milliseconds);
    Promise.resolve()
      .then(operation)
      .then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); }
      );
  });
}

const READ_ACTIONS = {
  login: new Set([""]),
  couple: new Set(["mine"]),
  records: new Set(["list", "feed", "get", "stats"]),
  plans: new Set(["list", "get", "randomMenu"]),
  rewards: new Set(["summary", "list", "pendingTasks", "listCatalog", "listInventory"]),
  media: new Set(["listAlbums", "listAssets"]),
  notifications: new Set(["getPreferences", "list", "preview"]),
  dashboard: new Set(["summary", "calendar", "search", "sync", "export", "health"])
};

// 服务端已有幂等键保护的写操作：超时重放不会产生重复副作用，允许客户端自动重试一次。
// records.react 依赖 record_reaction_requests 幂等文档，rewards.redeemItem 依赖 reward_inventory/流水幂等文档。
const IDEMPOTENT_WRITE_ACTIONS = {
  records: new Set(["react"]),
  rewards: new Set(["redeemItem"])
};

function getRequestPolicy(name, action = "") {
  const key = action || "";
  if (READ_ACTIONS[name] && READ_ACTIONS[name].has(key)) {
    return { timeoutMs: 12000, retries: 1, delayMs: 250 };
  }
  const idempotentWrite = Boolean(IDEMPOTENT_WRITE_ACTIONS[name] && IDEMPOTENT_WRITE_ACTIONS[name].has(key));
  // 写操作必须有超时兜底：0（无超时）会让悬挂的写请求把 UI 永远卡在 loading；
  // 除幂等写以外不自动重试，避免“已落库但响应超时”被重放成重复写入。
  return {
    timeoutMs: 20000,
    retries: idempotentWrite ? 1 : 0,
    delayMs: idempotentWrite ? 250 : 0,
    timeoutMessage: WRITE_TIMEOUT_MESSAGE
  };
}

async function executeWithRetry(operation, options = {}) {
  const retries = Math.max(Number(options.retries) || 0, 0);
  const shouldRetry = typeof options.shouldRetry === "function" ? options.shouldRetry : () => false;
  let attempt = 0;
  while (true) {
    try {
      return await runWithTimeout(operation, options.timeoutMs, options.timeoutMessage);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      attempt += 1;
      await wait(options.delayMs);
    }
  }
}

module.exports = { executeWithRetry, getRequestPolicy };
