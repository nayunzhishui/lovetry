const test = require("node:test");
const assert = require("node:assert/strict");

const { QUESTIONS, questionForDate } = require("../couple-miniprogram/shared/daily-questions");

test("题库固定为 50 条且 id 与文案均不重复", () => {
  assert.equal(QUESTIONS.length, 50);
  assert.equal(new Set(QUESTIONS.map((question) => question.id)).size, 50);
  assert.equal(new Set(QUESTIONS.map((question) => question.text)).size, 50);
  for (const question of QUESTIONS) {
    assert.ok(question.id && question.text.trim().length > 0);
  }
});

test("同一天多次取题结果确定且来自题库", () => {
  const first = questionForDate("2026-07-26");
  const second = questionForDate("2026-07-26");
  assert.deepEqual(first, second);
  assert.ok(QUESTIONS.some((question) => question.id === first.id && question.text === first.text));
});

test("不同日期的分布合理：60 天窗口内至少覆盖 30 道不同的题", () => {
  const seen = new Set();
  const start = new Date(2026, 0, 1);
  for (let offset = 0; offset < 60; offset += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const text = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    seen.add(questionForDate(text).id);
  }
  assert.ok(seen.size >= 30, `60 天只覆盖了 ${seen.size} 道题`);
});

test("跨年份取题依旧确定，不依赖运行环境", () => {
  assert.deepEqual(questionForDate("2027-02-14"), questionForDate("2027-02-14"));
  // 相邻两天通常不应总是同一道题（弱分布检查）
  const days = ["2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27"];
  const ids = new Set(days.map((day) => questionForDate(day).id));
  assert.ok(ids.size >= 2);
});
