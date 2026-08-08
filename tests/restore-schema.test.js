const test = require("node:test");
const assert = require("node:assert/strict");

const { validateBackupEnvelope } = require("../couple-miniprogram/cloudfunctions/dashboard/backup");

function envelope(overrides = {}) {
  return {
    schemaVersion: 1,
    couple: { _id: "couple-a", members: ["user-a", "user-b"] },
    records: [],
    plans: [],
    truncated: { records: false, plans: false, albums: false, mediaAssets: false },
    ...overrides
  };
}

test("备份恢复重新执行记录白名单且不恢复伪造回应", () => {
  const result = validateBackupEnvelope(envelope({
    records: [{
      _id: "record-a",
      type: "mood",
      title: " 心情 ",
      content: "正文",
      visibility: "private",
      metrics: { durationMinutes: 999, injected: true },
      payload: {
        level: 99,
        tags: ["工作", "x".repeat(80)],
        reactionsByOpenid: { "user-b": "hug" },
        injected: "drop-me"
      }
    }]
  }), "couple-a");

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].title, "心情");
  assert.deepEqual(result.records[0].metrics, {});
  assert.equal(result.records[0].payload.level, 5);
  assert.deepEqual(Object.keys(result.records[0].payload).sort(), ["level", "tags"]);
  assert.ok(result.records[0].payload.tags[1].length <= 30);
});

test("备份恢复按计划类型剔除无关字段", () => {
  const result = validateBackupEnvelope(envelope({
    plans: [{
      _id: "plan-a",
      type: "menu",
      title: " 晚饭 ",
      rewardPoints: 999,
      assigneeOpenids: ["user-a", "attacker"],
      startAt: "2026-08-07T12:00:00.000Z",
      payload: {
        category: "川菜",
        preference: 8,
        tags: ["辣"],
        checklist: [{ title: "不应保留", done: true }],
        injected: true
      }
    }]
  }), "couple-a");

  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].title, "晚饭");
  assert.equal(result.plans[0].rewardPoints, 0);
  assert.deepEqual(result.plans[0].assigneeOpenids, []);
  assert.equal(result.plans[0].startAt, null);
  assert.deepEqual(result.plans[0].payload, { category: "川菜", preference: 5, tags: ["辣"] });
});

test("备份恢复跳过不支持类型和空内容", () => {
  const result = validateBackupEnvelope(envelope({
    records: [
      { _id: "bad-type", type: "unknown", title: "x" },
      { _id: "empty", type: "moment", title: "", content: "" }
    ],
    plans: [{ _id: "bad-plan", type: "unknown", title: "x" }]
  }), "couple-a");

  assert.deepEqual(result.records, []);
  assert.deepEqual(result.plans, []);
});
