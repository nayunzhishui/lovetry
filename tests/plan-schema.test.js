const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizePlanPayload } = require("../couple-miniprogram/cloudfunctions/plans/schema");

test("任务计划只保留受限清单字段", () => {
  const payload = sanitizePlanPayload("task", {
    checklist: [
      { title: "证件", done: true, secret: "drop" },
      { title: "充电器", done: "true" },
      { title: "" }
    ],
    arbitrary: "drop"
  });
  assert.deepEqual(payload, {
    checklist: [
      { title: "证件", done: true },
      { title: "充电器", done: false }
    ]
  });
});

test("菜单、旅行和纪念日 payload 按类型限制范围", () => {
  assert.deepEqual(
    sanitizePlanPayload("menu", { category: "餐厅", preference: 99, tags: Array(10).fill("想去"), extra: true }),
    { category: "餐厅", preference: 5, tags: Array(8).fill("想去") }
  );

  assert.deepEqual(
    sanitizePlanPayload("trip", { budget: -20, itinerary: ["第一天"], checklist: [{ title: "证件", done: false }], extra: true }),
    { budget: 0, itinerary: ["第一天"], checklist: [{ title: "证件", done: false }] }
  );

  assert.deepEqual(
    sanitizePlanPayload("anniversary", { repeatYearly: false, reminderDays: 99, extra: true }),
    { repeatYearly: false, reminderDays: 30 }
  );
});

test("事件计划不接受任意 payload", () => {
  assert.deepEqual(sanitizePlanPayload("event", { hidden: "drop" }), {});
});
