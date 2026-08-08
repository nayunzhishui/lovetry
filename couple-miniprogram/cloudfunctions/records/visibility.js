const RECORD_TYPES = new Set([
  "moment",
  "mood",
  "conflict",
  "outing",
  "sleep",
  "period",
  "intimacy",
  "game",
  "pomodoro"
]);

const PRIVATE_BY_DEFAULT = new Set(["mood", "conflict", "sleep", "period", "intimacy", "pomodoro"]);

function normalizeVisibility(type, visibility, existingVisibility) {
  if (visibility === "private" || visibility === "couple") return visibility;
  // 更新时不带 visibility 字段必须保留现有值，禁止悄悄回落到类型默认值（避免私密记录被翻转为可见）。
  if (existingVisibility === "private" || existingVisibility === "couple") return existingVisibility;
  return PRIVATE_BY_DEFAULT.has(type) ? "private" : "couple";
}

module.exports = { RECORD_TYPES, PRIVATE_BY_DEFAULT, normalizeVisibility };
