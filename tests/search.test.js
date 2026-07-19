const test = require("node:test");
const assert = require("node:assert/strict");

const {
  decorateSearchResult,
  typeOptionsForSource,
  validateSearchRange
} = require("../couple-miniprogram/shared/search");

test("搜索筛选只展示用户可理解的类型名称", () => {
  const options = typeOptionsForSource("plan");
  assert.deepEqual(options.map((item) => item.label), ["全部类型", "共同任务", "日程事件", "共同菜单", "旅行计划", "纪念日"]);
  assert.equal(options.some((item) => item.label === "trip"), false);
});

test("记录筛选包含亲密记录且使用中性名称", () => {
  const options = typeOptionsForSource("record");
  assert.equal(options.some((item) => item.value === "intimacy" && item.label === "亲密记录"), true);
});

test("搜索拒绝倒置日期并装饰结果标签", () => {
  assert.throws(
    () => validateSearchRange("2026-07-17", "2026-07-16"),
    (error) => error.code === "INVALID_DATE_RANGE"
  );
  assert.deepEqual(decorateSearchResult({
    id: "plan-a",
    source: "plan",
    type: "trip",
    title: "去海边",
    occurredAt: "2026-07-16T08:00:00.000Z"
  }), {
    id: "plan-a",
    source: "plan",
    sourceLabel: "计划",
    type: "trip",
    typeLabel: "旅行计划",
    title: "去海边",
    occurredAt: "2026-07-16T08:00:00.000Z",
    dateText: "2026.07.16"
  });
});
