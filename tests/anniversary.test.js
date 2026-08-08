const test = require("node:test");
const assert = require("node:assert/strict");

const { daysTogether, nextAnniversary } = require("../couple-miniprogram/shared/anniversary");

test("跨年时返回下一次纪念日和剩余天数", () => {
  const result = nextAnniversary("2020-01-03", new Date("2026-12-30T08:00:00+08:00"));
  assert.equal(result.date, "2027-01-03");
  assert.equal(result.daysRemaining, 4);
});

test("非闰年将 2 月 29 日纪念日落在 2 月 28 日", () => {
  const result = nextAnniversary("2024-02-29", new Date("2027-02-27T08:00:00+08:00"));
  assert.equal(result.date, "2027-02-28");
  assert.equal(result.daysRemaining, 1);
});

test("在一起天数按本地日历计算且当天记为第 1 天", () => {
  const now = new Date("2026-07-26T23:30:00+08:00");
  assert.equal(daysTogether("2026-07-26", now), 1);
  assert.equal(daysTogether("2026-07-25", now), 2);
  assert.equal(daysTogether("2025-07-26", now), 366);
});

test("在一起天数对非法或未来日期返回 0", () => {
  const now = new Date("2026-07-26T08:00:00+08:00");
  assert.equal(daysTogether("", now), 0);
  assert.equal(daysTogether("2026-13-40", now), 0);
  assert.equal(daysTogether("2026-02-30", now), 0);
  assert.equal(daysTogether("2026-08-01", now), 0);
});
