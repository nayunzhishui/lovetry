const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRecordInsight, median } = require("../couple-miniprogram/shared/record-insights");

test("中位数对奇偶样本都保持透明稳定", () => {
  assert.equal(median([31, 28, 29]), 29);
  assert.equal(median([28, 30, 32, 34]), 31);
});

test("心情洞察只做阶段观察并生成最近趋势", () => {
  const records = [5, 3, 4].map((level, index) => ({
    _id: `m${index}`,
    type: "mood",
    startAt: `2026-07-${18 - index}T12:00:00+08:00`,
    payload: { level, tags: index < 2 ? ["安心"] : ["疲惫"] }
  }));
  const insight = buildRecordInsight("mood", records);
  assert.equal(insight.metrics[0].value, "4/5");
  assert.equal(insight.metrics[2].value, "安心");
  assert.equal(insight.bars.length, 3);
  assert.match(insight.note, /阶段性观察/);
  assert.doesNotMatch(insight.note, /诊断为|伴侣导致/);
});

test("生理期至少三个有效周期后才显示透明估算", () => {
  const starts = ["2026-03-01", "2026-03-30", "2026-04-28", "2026-05-28"];
  const records = starts.map((date, index) => ({
    _id: `p${index}`,
    type: "period",
    startAt: `${date}T00:00:00+08:00`,
    endAt: `${date}T23:59:00+08:00`
  })).reverse();
  const insight = buildRecordInsight("period", records);
  assert.equal(insight.metrics[0].value, "29 天");
  assert.equal(insight.metrics[2].value, "2026-06-26");
  assert.match(insight.note, /3 个有效周期/);
  assert.match(insight.note, /不代表排卵、避孕或医疗结论/);
});

test("睡眠洞察展示时长和入睡醒来时间但不作健康诊断", () => {
  const records = [0, 1, 2].map((offset) => ({
    _id: `s${offset}`,
    type: "sleep",
    startAt: `2026-07-${18 - offset}T23:00:00+08:00`,
    endAt: `2026-07-${19 - offset}T07:00:00+08:00`,
    metrics: { durationMinutes: 480 }
  }));
  const insight = buildRecordInsight("sleep", records);
  assert.equal(insight.metrics[0].value, "8 小时");
  assert.equal(insight.metrics[1].value, "23:00");
  assert.equal(insight.metrics[2].value, "07:00");
  assert.match(insight.note, /不提供健康诊断/);
});

test("玩乐摘要累计已填写金额且提醒不比较付出", () => {
  const records = [
    { type: "outing", payload: { category: "吃饭", amount: 120 } },
    { type: "outing", payload: { category: "吃饭", amount: 80 } },
    { type: "outing", payload: { category: "旅行", amount: null } }
  ];
  const insight = buildRecordInsight("outing", records);
  assert.equal(insight.metrics[1].value, "¥200");
  assert.equal(insight.metrics[2].value, "吃饭");
  assert.match(insight.note, /不用于比较/);
});
