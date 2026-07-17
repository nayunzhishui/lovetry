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

test("日历空日期可以直接创建当天记录或事件", (t) => {
  let pageDefinition;
  const urls = [];
  global.Page = (definition) => { pageDefinition = definition; };
  global.wx = { navigateTo({ url }) { urls.push(url); } };
  t.after(() => {
    delete global.Page;
    delete global.wx;
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/pages/calendar/calendar")];
  });

  require("../couple-miniprogram/miniprogram/pages/calendar/calendar");
  const page = { data: { selectedKey: "2026-07-18" } };
  pageDefinition.addRecordForSelectedDay.call(page);
  pageDefinition.addPlanForSelectedDay.call(page);
  assert.deepEqual(urls, [
    "/pages/record-form/record-form?type=moment&date=2026-07-18",
    "/pages/plans/plans?type=event&date=2026-07-18"
  ]);
});
