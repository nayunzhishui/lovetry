const test = require("node:test");
const assert = require("node:assert/strict");

function createStorageWx() {
  const storage = new Map();
  return {
    storage,
    api: {
      getStorageSync(key) { return storage.get(key); },
      setStorageSync(key, value) { storage.set(key, value); },
      removeStorageSync(key) { storage.delete(key); },
      showLoading() {},
      hideLoading() {},
      showToast() {},
      navigateBack() {}
    }
  };
}

test("普通记录草稿恢复时沿用同一 clientRequestId", (t) => {
  const { api } = createStorageWx();
  let pageDefinition;
  global.wx = api;
  global.getApp = () => ({ globalData: { openid: "user-a", couple: { _id: "couple-a" } } });
  global.Page = (definition) => { pageDefinition = definition; };
  t.after(() => {
    delete global.wx;
    delete global.getApp;
    delete global.Page;
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/pages/record-form/record-form")];
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/services/formDraft")];
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/services/agentHandoff")];
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/services/storageScope")];
  });

  require("../couple-miniprogram/miniprogram/pages/record-form/record-form");
  const makePage = () => ({
    ...pageDefinition,
    data: { ...pageDefinition.data },
    setData(next) { this.data = { ...this.data, ...next }; }
  });

  const first = makePage();
  first.onLoad({ type: "mood" });
  first.setData({ title: "一次记录", content: "网络不稳定时也不应重复创建" });
  first.draftDirty = true;
  first.persistDraft();
  const firstId = first.data.clientRequestId;
  assert.match(firstId, /^record-/);
  assert.equal(first.buildRecord().clientRequestId, firstId);

  const restored = makePage();
  restored.onLoad({ type: "mood" });
  assert.equal(restored.data.clientRequestId, firstId);
  assert.equal(restored.buildRecord().clientRequestId, firstId);
});

test("同步游标按 openid 与 coupleId 隔离存储", async (t) => {
  const cloudApi = require("../couple-miniprogram/miniprogram/services/cloudApi");
  const originalSyncSince = cloudApi.syncSince;
  cloudApi.syncSince = () => Promise.resolve({
    changes: { records: [], plans: [], notifications: [] },
    cursor: "2026-08-07T12:00:00.000Z",
    hasMore: false,
    nextOffsets: { records: 0, plans: 0, notifications: 0 }
  });

  const readKeys = [];
  const writeKeys = [];
  let appDefinition;
  global.wx = {
    getStorageSync(key) { readKeys.push(key); return ""; },
    setStorageSync(key) { writeKeys.push(key); },
    removeStorageSync() {},
    showToast() {}
  };
  global.App = (definition) => { appDefinition = definition; };
  t.after(() => {
    cloudApi.syncSince = originalSyncSince;
    delete global.wx;
    delete global.App;
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/app")];
  });

  require("../couple-miniprogram/miniprogram/app");
  const runFor = async (openid, coupleId) => {
    const app = {
      ...appDefinition,
      globalData: {
        ...appDefinition.globalData,
        openid,
        couple: { _id: coupleId },
        isOnline: true
      }
    };
    await app.syncChanges({ silent: true });
  };

  await runFor("user-a", "couple-1");
  await runFor("user-b", "couple-1");
  await runFor("user-a", "couple-2");

  assert.equal(new Set(readKeys).size, 3);
  assert.equal(new Set(writeKeys).size, 3);
  assert.ok(readKeys.every((key) => key.startsWith("lovetry_sync_cursor_v2:")));
  assert.notEqual(readKeys[0], readKeys[1]);
  assert.notEqual(readKeys[0], readKeys[2]);
});
