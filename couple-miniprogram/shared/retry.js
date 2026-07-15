function wait(milliseconds) {
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function runWithTimeout(operation, timeoutMs) {
  const milliseconds = Math.max(Number(timeoutMs) || 0, 0);
  if (!milliseconds) return Promise.resolve().then(operation);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("请求超时，请检查网络后重试");
      error.code = "REQUEST_TIMEOUT";
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

function getRequestPolicy(name, action = "") {
  const readOnly = READ_ACTIONS[name] && READ_ACTIONS[name].has(action || "");
  return readOnly
    ? { timeoutMs: 12000, retries: 1, delayMs: 250 }
    : { timeoutMs: 0, retries: 0, delayMs: 0 };
}

async function executeWithRetry(operation, options = {}) {
  const retries = Math.max(Number(options.retries) || 0, 0);
  const shouldRetry = typeof options.shouldRetry === "function" ? options.shouldRetry : () => false;
  let attempt = 0;
  while (true) {
    try {
      return await runWithTimeout(operation, options.timeoutMs);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      attempt += 1;
      await wait(options.delayMs);
    }
  }
}

module.exports = { executeWithRetry, getRequestPolicy };
