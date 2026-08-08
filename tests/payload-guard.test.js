const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const recordsGuard = require("../couple-miniprogram/cloudfunctions/records/payload-guard");
const plansGuard = require("../couple-miniprogram/cloudfunctions/plans/payload-guard");
const { preservePartnerReactions } = require("../couple-miniprogram/cloudfunctions/records/reactions");

test("records 与 plans 的 payload-guard 拷贝内容保持一致", () => {
  const read = (name) => fs.readFileSync(
    path.join(__dirname, "..", "couple-miniprogram", "cloudfunctions", name, "payload-guard.js"),
    "utf8"
  );
  assert.equal(read("records"), read("plans"));
  assert.equal(plansGuard.MAX_FLEXIBLE_FIELD_JSON_LENGTH, recordsGuard.MAX_FLEXIBLE_FIELD_JSON_LENGTH);
});

test("payload 与 metrics 的 JSON 体积超过 16384 会被判定超限", () => {
  const { exceedsFlexibleFieldLimit, MAX_FLEXIBLE_FIELD_JSON_LENGTH } = recordsGuard;
  assert.equal(MAX_FLEXIBLE_FIELD_JSON_LENGTH, 16384);
  assert.equal(exceedsFlexibleFieldLimit({ note: "ok" }), false);
  assert.equal(exceedsFlexibleFieldLimit(null), false);
  assert.equal(exceedsFlexibleFieldLimit(undefined), false);
  // 边界：JSON 长度恰好等于上限不算超限，超过 1 字符即超限
  const boundary = "x".repeat(MAX_FLEXIBLE_FIELD_JSON_LENGTH - 2); // 序列化后含两个引号
  assert.equal(exceedsFlexibleFieldLimit(boundary), false);
  assert.equal(exceedsFlexibleFieldLimit(`${boundary}x`), true);
  assert.equal(exceedsFlexibleFieldLimit({ blob: "x".repeat(MAX_FLEXIBLE_FIELD_JSON_LENGTH) }), true);
  // 无法序列化（循环引用）的输入一律视为超限
  const circular = {};
  circular.self = circular;
  assert.equal(exceedsFlexibleFieldLimit(circular), true);
});

test("编辑记录时输入里的 reactionsByOpenid 被剥离，并保留伴侣已有轻回应", () => {
  const merged = preservePartnerReactions(
    { mood: "great", reactionsByOpenid: { hacker: "hug" } },
    { reactionsByOpenid: { partner: "seen" }, other: 1 }
  );
  assert.deepEqual(merged, { mood: "great", reactionsByOpenid: { partner: "seen" } });
  // 创建场景：没有已存在 payload，伪造的轻回应被直接丢弃
  assert.deepEqual(preservePartnerReactions({ reactionsByOpenid: { hacker: "hug" } }, null), {});
  // 输入不带 reactions 时，已有轻回应原样保留
  assert.deepEqual(
    preservePartnerReactions({ note: "n" }, { reactionsByOpenid: { partner: "cheer" } }),
    { note: "n", reactionsByOpenid: { partner: "cheer" } }
  );
  assert.deepEqual(preservePartnerReactions(null, null), {});
});
