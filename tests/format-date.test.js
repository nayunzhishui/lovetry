const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatCompact,
  formatDate,
  formatDateTime,
  formatDay
} = require("../couple-miniprogram/shared/format-date");

test("常规日期输出中文格式，个位月日不补零", () => {
  const date = new Date(2026, 6, 26, 14, 30);
  assert.equal(formatDate(date), "2026年7月26日");
  assert.equal(formatDateTime(date), "2026年7月26日 14:30");
  assert.equal(formatDay(date), "7月26日");
});

test("紧凑格式月日时分统一补零", () => {
  assert.equal(formatCompact(new Date(2026, 0, 5, 8, 7)), "2026.01.05 08:07");
});

test("个位月与个位日、零点时刻处理正确", () => {
  const date = new Date(2027, 2, 3, 0, 5);
  assert.equal(formatDate(date), "2027年3月3日");
  assert.equal(formatDateTime(date), "2027年3月3日 00:05");
  assert.equal(formatDay(date), "3月3日");
  assert.equal(formatCompact(date), "2027.03.03 00:05");
});

test("跨年份边界（12 月 31 日与 1 月 1 日）", () => {
  assert.equal(formatDate(new Date(2025, 11, 31, 23, 59)), "2025年12月31日");
  assert.equal(formatDateTime(new Date(2026, 0, 1, 0, 0)), "2026年1月1日 00:00");
});

test("接受时间戳与日期字符串输入", () => {
  const date = new Date(2026, 6, 26, 9, 5);
  assert.equal(formatDateTime(date.getTime()), "2026年7月26日 09:05");
  assert.equal(formatDay("2026-07-26T12:00:00"), "7月26日");
});

test("空值与无效日期一律返回空字符串", () => {
  for (const value of [null, undefined, "", "not-a-date", new Date("invalid"), Number.NaN]) {
    assert.equal(formatDate(value), "");
    assert.equal(formatDateTime(value), "");
    assert.equal(formatDay(value), "");
    assert.equal(formatCompact(value), "");
  }
});
