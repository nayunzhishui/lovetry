const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COOLING_OFF_DAYS,
  computePurgeAt,
  isPurgeDue,
  remainingDays
} = require("../couple-miniprogram/cloudfunctions/couple/archive-policy");

test("冷静期固定为 7 天，computePurgeAt 从当前时间起算", () => {
  assert.equal(COOLING_OFF_DAYS, 7);
  const now = new Date("2026-07-26T10:00:00+08:00");
  const purgeAt = computePurgeAt(now);
  assert.equal(purgeAt.getTime() - now.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(computePurgeAt("not-a-date"), null);
});

test("isPurgeDue 只在 archiving 且到期时成立", () => {
  const now = new Date("2026-07-26T10:00:00+08:00");
  const due = { status: "archiving", scheduledPurgeAt: new Date("2026-07-26T09:59:59+08:00") };
  const notDue = { status: "archiving", scheduledPurgeAt: new Date("2026-07-26T10:00:01+08:00") };
  assert.equal(isPurgeDue(due, now), true);
  assert.equal(isPurgeDue({ ...due, scheduledPurgeAt: now }, now), true);
  assert.equal(isPurgeDue(notDue, now), false);
  // 已撤销（active）或已归档的空间即使带着旧的 scheduledPurgeAt 也不能再归档
  assert.equal(isPurgeDue({ ...due, status: "active" }, now), false);
  assert.equal(isPurgeDue({ ...due, status: "archived" }, now), false);
  assert.equal(isPurgeDue({ status: "archiving", scheduledPurgeAt: null }, now), false);
  assert.equal(isPurgeDue(null, now), false);
});

test("isPurgeDue 兼容 ISO 字符串形式的 scheduledPurgeAt", () => {
  const now = new Date("2026-07-26T10:00:00+08:00");
  assert.equal(isPurgeDue({ status: "archiving", scheduledPurgeAt: "2026-07-25T00:00:00+08:00" }, now), true);
  assert.equal(isPurgeDue({ status: "archiving", scheduledPurgeAt: "invalid" }, now), false);
});

test("remainingDays 向上取整且不会为负", () => {
  const requestedAt = new Date("2026-07-26T10:00:00+08:00");
  const coupleDoc = { status: "archiving", scheduledPurgeAt: computePurgeAt(requestedAt) };
  assert.equal(remainingDays(coupleDoc, requestedAt), 7);
  // 过了 1 秒仍然按"7 天内"向上取整
  assert.equal(remainingDays(coupleDoc, new Date(requestedAt.getTime() + 1000)), 7);
  // 到期前最后一小时显示 1 天
  assert.equal(remainingDays(coupleDoc, new Date(coupleDoc.scheduledPurgeAt.getTime() - 3600000)), 1);
  // 已到期或缺字段时为 0
  assert.equal(remainingDays(coupleDoc, new Date(coupleDoc.scheduledPurgeAt.getTime() + 1000)), 0);
  assert.equal(remainingDays({ status: "archiving" }, requestedAt), 0);
  assert.equal(remainingDays(null, requestedAt), 0);
});
