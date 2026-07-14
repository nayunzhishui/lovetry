const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateDurationMinutes,
  DomainError
} = require("../couple-miniprogram/shared");

test("只有时分的结束时间早于开始时间时按跨午夜计算", () => {
  assert.equal(calculateDurationMinutes("23:30", "07:00"), 450);
});

test("带日期的跨午夜时间按实际时间差计算", () => {
  assert.equal(
    calculateDurationMinutes(
      "2026-07-15T23:30:00+08:00",
      "2026-07-16T07:00:00+08:00"
    ),
    450
  );
});

test("无效或倒置的完整时间会返回明确业务错误", () => {
  assert.throws(
    () =>
      calculateDurationMinutes(
        "2026-07-16T07:00:00+08:00",
        "2026-07-15T23:30:00+08:00"
      ),
    (error) =>
      error instanceof DomainError && error.code === "INVALID_TIME"
  );
});
