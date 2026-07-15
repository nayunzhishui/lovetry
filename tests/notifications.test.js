const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReminderCandidates, reminderKey } = require("../couple-miniprogram/shared/notifications");

test("生成到期任务和临近纪念日提醒且键值稳定", () => {
  const plans = [
    { _id: "task-1", type: "task", title: "取快递", status: "todo", endAt: "2026-07-16T12:00:00+08:00", payload: { reminderDays: 1 } },
    { _id: "ann-1", type: "anniversary", title: "第一次旅行", startAt: "2020-07-18T00:00:00+08:00", payload: { reminderDays: 3, repeatYearly: true } },
    { _id: "done-1", type: "task", title: "已完成", status: "done", endAt: "2026-07-16T12:00:00+08:00" }
  ];
  const reminders = buildReminderCandidates(plans, new Date("2026-07-15T09:00:00+08:00"));
  assert.deepEqual(reminders.map((item) => item.sourceId), ["task-1", "ann-1"]);
  assert.equal(reminderKey("couple-a", "user-a", reminders[0]), "couple-a:user-a:task:task-1:2026-07-16");
});

test("生成等待伴侣兑现的奖励提醒", () => {
  const reminders = buildReminderCandidates([], new Date("2026-07-15T09:00:00+08:00"), [
    { _id: "inventory-1", title: "周末早餐券", status: "pending" },
    { _id: "inventory-2", title: "已确认奖励", status: "ready" }
  ]);
  assert.deepEqual(reminders, [{
    type: "rewardApproval",
    sourceId: "inventory-1",
    title: "待兑现：周末早餐券",
    scheduledDate: "2026-07-15",
    daysRemaining: 0
  }]);
});
