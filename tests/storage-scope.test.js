const test = require("node:test");
const assert = require("node:assert/strict");

function loadStorageScope(t, globalData) {
  const storage = new Map();
  global.getApp = () => ({ globalData });
  global.wx = {
    getStorageSync(key) { return storage.get(key); },
    setStorageSync(key, value) { storage.set(key, value); },
    removeStorageSync(key) { storage.delete(key); }
  };
  const path = require.resolve("../couple-miniprogram/miniprogram/services/storageScope");
  delete require.cache[path];
  const module = require(path);
  t.after(() => {
    delete global.getApp;
    delete global.wx;
    delete require.cache[path];
  });
  return { ...module, storage };
}

test("本机敏感缓存按 openid 和 coupleId 共同分区", (t) => {
  const globalData = { openid: "user-a", couple: { _id: "couple-1" } };
  const { createScopedStorageAdapter, storage } = loadStorageScope(t, globalData);
  const adapter = createScopedStorageAdapter();

  adapter.set("draft", { secret: "a" });
  assert.deepEqual(adapter.get("draft"), { secret: "a" });
  assert.ok([...storage.keys()][0].includes("user-a:couple-1"));

  globalData.openid = "user-b";
  assert.equal(adapter.get("draft"), undefined);

  globalData.openid = "user-a";
  globalData.couple = { _id: "couple-2" };
  assert.equal(adapter.get("draft"), undefined);
});

test("显式身份作用域可在 App bootstrap 前安全初始化番茄缓存", (t) => {
  const { createScopedStorageAdapter, storage } = loadStorageScope(t, { openid: "", couple: null });
  const adapter = createScopedStorageAdapter({ openid: "user-a", coupleId: "couple-1" });
  adapter.set("lovetry_pomodoro_v2", { status: "paused" });
  assert.deepEqual(adapter.get("lovetry_pomodoro_v2"), { status: "paused" });
  assert.ok([...storage.keys()][0].includes("user-a:couple-1"));
});

test("身份或情侣空间未确定时拒绝写入敏感本机缓存", (t) => {
  const { createScopedStorageAdapter } = loadStorageScope(t, { openid: "", couple: null });
  const adapter = createScopedStorageAdapter();
  assert.equal(adapter.get("draft"), null);
  assert.throws(() => adapter.set("draft", { secret: true }), /STORAGE_SCOPE_UNAVAILABLE/);
  assert.equal(adapter.remove("draft"), false);
});
