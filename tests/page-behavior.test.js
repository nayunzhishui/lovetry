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

test("共同计划默认展示清单，带日期进入时直接展开新增表单", (t) => {
  let pageDefinition;
  global.Page = (definition) => { pageDefinition = definition; };
  global.wx = {};
  t.after(() => {
    delete global.Page;
    delete global.wx;
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/pages/plans/plans")];
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/services/formDraft")];
  });

  require("../couple-miniprogram/miniprogram/pages/plans/plans");
  assert.equal(pageDefinition.data.composerOpen, false);

  const page = {
    data: { ...pageDefinition.data },
    setData(next) { this.data = { ...this.data, ...next }; }
  };
  pageDefinition.onLoad.call(page, { type: "event", date: "2026-07-18" });
  assert.equal(page.data.activeType, "event");
  assert.equal(page.data.composerOpen, true);
  assert.equal(page.data.form.startDate, "2026-07-18");
});

test("首页一步入口可以直接开始心情记录和今天的安排", (t) => {
  const app = { globalData: {} };
  const urls = [];
  let pageDefinition;
  global.getApp = () => app;
  global.Page = (definition) => { pageDefinition = definition; };
  global.wx = { navigateTo({ url }) { urls.push(url); } };
  t.after(() => {
    delete global.getApp;
    delete global.Page;
    delete global.wx;
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/pages/index/index")];
  });

  require("../couple-miniprogram/miniprogram/pages/index/index");
  pageDefinition.goMood.call({});
  pageDefinition.goTodayPlan.call({});
  assert.equal(urls[0], "/pages/record-form/record-form?type=mood");
  assert.match(urls[1], /^\/pages\/plans\/plans\?type=event&date=\d{4}-\d{2}-\d{2}$/);
});

test("切换日历月份时选中目标月中最接近的日期", (t) => {
  let pageDefinition;
  global.Page = (definition) => { pageDefinition = definition; };
  t.after(() => {
    delete global.Page;
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/pages/calendar/calendar")];
  });

  require("../couple-miniprogram/miniprogram/pages/calendar/calendar");
  const page = {
    data: { month: new Date(2026, 0, 1), selectedKey: "2026-01-31" },
    setData(next) { this.data = { ...this.data, ...next }; },
    loadMonth(month) { this.loadedMonth = month; }
  };
  pageDefinition.nextMonth.call(page);
  assert.equal(page.data.selectedKey, "2026-02-28");
  assert.equal(page.loadedMonth.getMonth(), 1);
});
