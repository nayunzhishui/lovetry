const test = require("node:test");
const assert = require("node:assert/strict");

const { nextAnniversary } = require("../couple-miniprogram/shared/anniversary");

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
