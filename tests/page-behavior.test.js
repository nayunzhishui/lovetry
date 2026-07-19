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

  app.globalData.syncErrorAt = "2026-07-20T12:00:00.000Z";
  pageDefinition.refreshSyncText.call(page);
  assert.match(page.data.syncText, /点击重试/);
  assert.equal(page.data.syncFailed, true);
});

test("十四项功能在首页任务域和表单中保持可发现", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "../couple-miniprogram/miniprogram");
  const home = fs.readFileSync(path.join(root, "pages/index/index.wxml"), "utf8");
  const recordForm = fs.readFileSync(path.join(root, "pages/record-form/record-form.js"), "utf8");
  const plans = fs.readFileSync(path.join(root, "pages/plans/plans.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.json"), "utf8");

  for (const label of ["日记", "心情", "玩乐", "睡眠", "生理与亲密", "游戏", "专注", "任务清单", "事件", "菜单", "旅行", "奖励账户", "共同相册", "共同日历"]) {
    assert.ok(`${home}\n${recordForm}\n${plans}\n${app}`.includes(label), `缺少功能入口：${label}`);
  }
});

test("日历日期可以直接记录生理期、亲密事件或普通事项", (t) => {
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
  pageDefinition.addPeriodForSelectedDay.call(page);
  pageDefinition.addIntimacyForSelectedDay.call(page);
  pageDefinition.addRecordForSelectedDay.call(page);
  pageDefinition.addPlanForSelectedDay.call(page);
  assert.deepEqual(urls, [
    "/pages/record-form/record-form?type=period&date=2026-07-18",
    "/pages/record-form/record-form?type=intimacy&date=2026-07-18",
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

test("恋爱助手降级成功时显示中性通知并保留回答来源", async (t) => {
  const cloudApi = require("../couple-miniprogram/miniprogram/services/cloudApi");
  const originalAsk = cloudApi.askLoveAgent;
  cloudApi.askLoveAgent = () => Promise.resolve({
    answer: "我们先把事实和猜测分开。",
    mode: "knowledge",
    sources: [],
    providerNotice: "模型 API 暂时不可用，已切换到本地知识库"
  });
  let pageDefinition;
  global.Page = (definition) => { pageDefinition = definition; };
  global.wx = { pageScrollTo() {} };
  t.after(() => {
    cloudApi.askLoveAgent = originalAsk;
    delete global.Page;
    delete global.wx;
    delete require.cache[require.resolve("../couple-miniprogram/miniprogram/features/love-agent/love-agent")];
  });

  require("../couple-miniprogram/miniprogram/features/love-agent/love-agent");
  const page = {
    data: { ...pageDefinition.data, question: "他是不是故意不理我？", messages: [] },
    setData(next) { this.data = { ...this.data, ...next }; }
  };
  pageDefinition.ask.call(page);
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(page.data.error, "");
  assert.match(page.data.notice, /本地知识库/);
  assert.equal(page.data.messages[1].modeText, "本地知识库回答");
});
