const test = require("node:test");
const assert = require("node:assert/strict");

const { presentCalendarEvents } = require("../couple-miniprogram/shared/calendar-view");

test("日历事项按时间排序并显示用户可理解的中文语义", () => {
  const result = presentCalendarEvents([
    { id: "plan-1", source: "plan", type: "task", title: "整理房间", startAt: "2026-07-18T16:00:00+08:00", status: "todo" },
    { id: "record-1", source: "record", type: "mood", title: "下午心情", startAt: "2026-07-18T14:30:00+08:00" }
  ]);

  assert.deepEqual(result.map((item) => item.id), ["record-1", "plan-1"]);
  assert.equal(result[0].typeLabel, "心情");
  assert.equal(result[0].sourceLabel, "生活记录");
  assert.equal(result[0].timeText, "14:30");
  assert.equal(result[1].typeLabel, "任务");
  assert.equal(result[1].statusLabel, "待完成");
  assert.equal(result[1].timeText, "全天");
});

test("日历能区分生理期与亲密记录", () => {
  const result = presentCalendarEvents([
    { id: "period-1", source: "record", type: "period", title: "生理期记录", startAt: "2026-07-18T00:00:00+08:00" },
    { id: "intimacy-1", source: "record", type: "intimacy", title: "亲密记录", startAt: "2026-07-18T22:10:00+08:00" }
  ]);

  assert.equal(result[0].typeLabel, "生理期");
  assert.equal(result[1].typeLabel, "亲密");
  assert.equal(result[1].timeText, "22:10");
});
