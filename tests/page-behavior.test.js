const test = require("node:test");
const assert = require("node:assert/strict");

test("首页同步状态能区分离线与远端更新", (t) => {
  const app = {
    globalData: {
      isOnline: false,
      syncSummary: { total: 0 },
      lastSyncAt: ""
    }
  };
  let pageDefinition;
  global.getApp = () => app;
  global.Page = (definition) => { pageDefinition = definition; };
  t.after(() => {
    delete global.getApp;
    delete global.Page;
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/pages/index/index")];
  });

  require("../couple-miniprogram/miniprogram/pages/index/index");
  const page = {
    data: { syncText: "" },
    setData(next) { this.data = { ...this.data, ...next }; }
  };
  pageDefinition.refreshSyncText.call(page);
  assert.match(page.data.syncText, /离线/);

  app.globalData.isOnline = true;
  app.globalData.syncSummary = { total: 3 };
  pageDefinition.refreshSyncText.call(page);
  assert.equal(page.data.syncText, "最近同步 · 接收 3 项更新");
});
