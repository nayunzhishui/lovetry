const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizeRecordMetrics,
  sanitizeRecordPayload
} = require("../couple-miniprogram/cloudfunctions/records/schema");

test("心情记录只保留声明字段并保留服务端已有回应", () => {
  const payload = sanitizeRecordPayload(
    "mood",
    {
      level: 99,
      tags: ["开心", "放松", "A", "B", "C", "D", "E", "F", "G"],
      reactionsByOpenid: { attacker: "hug" },
      hidden: "不应入库"
    },
    { reactionsByOpenid: { "user-b": "seen", invalid: "fake" } }
  );

  assert.equal(payload.level, 5);
  assert.equal(payload.tags.length, 8);
  assert.deepEqual(payload.reactionsByOpenid, { "user-b": "seen" });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "hidden"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.reactionsByOpenid, "attacker"), false);
});

test("沟通记录兼容旧 result 字段但丢弃未声明内容", () => {
  const payload = sanitizeRecordPayload("conflict", {
    feelings: "难过",
    needs: "被听见",
    communication: "先暂停",
    result: "明晚继续谈",
    satisfaction: 100,
    repairStatus: "unknown",
    diagnosis: "不应保存"
  });

  assert.deepEqual(payload, {
    feelings: "难过",
    needs: "被听见",
    communication: "先暂停",
    agreement: "明晚继续谈",
    satisfaction: 10,
    repairStatus: "noted"
  });
});

test("睡眠与番茄指标限制字段和范围", () => {
  assert.deepEqual(
    sanitizeRecordMetrics("sleep", { durationMinutes: 2000, arbitrary: 42 }),
    { durationMinutes: 1440 }
  );
  assert.deepEqual(
    sanitizeRecordMetrics("pomodoro", { plannedMinutes: 25, durationMinutes: 24, completed: "false", arbitrary: 42 }),
    { plannedMinutes: 25, durationMinutes: 24, completed: false }
  );
  assert.deepEqual(
    sanitizeRecordPayload("pomodoro", { phase: "break", result: "completed", extra: "drop" }),
    { phase: "focus", result: "completed" }
  );
});
