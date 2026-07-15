const test = require("node:test");
const assert = require("node:assert/strict");

const { executeWithRetry, getRequestPolicy } = require("../couple-miniprogram/shared/retry");

test("只读请求遇到一次瞬时网络错误后会自动重试", async () => {
  let attempts = 0;
  const result = await executeWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("network timeout");
        error.code = "NETWORK_ERROR";
        throw error;
      }
      return "ok";
    },
    { retries: 1, delayMs: 0, shouldRetry: (error) => error.code === "NETWORK_ERROR" }
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("只读请求超过时限会返回明确的 REQUEST_TIMEOUT", async () => {
  await assert.rejects(
    executeWithRetry(
      () => new Promise(() => {}),
      { timeoutMs: 15 }
    ),
    (error) => error.code === "REQUEST_TIMEOUT"
  );
});

test("只读请求允许超时重试，写请求不会被客户端自动重放", () => {
  assert.deepEqual(getRequestPolicy("records", "list"), { timeoutMs: 12000, retries: 1, delayMs: 250 });
  assert.deepEqual(getRequestPolicy("records", "create"), { timeoutMs: 0, retries: 0, delayMs: 0 });
  assert.deepEqual(getRequestPolicy("login"), { timeoutMs: 12000, retries: 1, delayMs: 250 });
});

test("云函数只读调用遇到 callFunction 瞬时失败会重试", async (t) => {
  let attempts = 0;
  global.wx = {
    cloud: {
      callFunction() {
        attempts += 1;
        if (attempts === 1) return Promise.reject({ errMsg: "cloud.callFunction:fail network unavailable" });
        return Promise.resolve({ result: { ok: true, data: { records: [] } } });
      }
    }
  };
  t.after(() => { delete global.wx; });

  const cloudApi = require("../couple-miniprogram/miniprogram/services/cloudApi");
  const result = await cloudApi.call("records", { action: "list" });
  assert.deepEqual(result, { records: [] });
  assert.equal(attempts, 2);
});
