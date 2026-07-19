const TYPE_LABELS = Object.freeze({
  moment: "共同经历",
  mood: "心情记录",
  conflict: "沟通复盘",
  outing: "玩乐记录",
  sleep: "睡眠记录",
  period: "生理期记录",
  intimacy: "亲密记录",
  game: "游戏记录",
  pomodoro: "专注记录",
  task: "共同任务",
  event: "日程事件",
  menu: "共同菜单",
  trip: "旅行计划",
  anniversary: "纪念日"
});

const RECORD_TYPES = ["moment", "mood", "conflict", "outing", "sleep", "period", "intimacy", "game", "pomodoro"];
const PLAN_TYPES = ["task", "event", "menu", "trip", "anniversary"];

function typeOptionsForSource(source) {
  const types = source === "record" ? RECORD_TYPES : source === "plan" ? PLAN_TYPES : [...RECORD_TYPES, ...PLAN_TYPES];
  return [{ value: "", label: "全部类型" }, ...types.map((value) => ({ value, label: TYPE_LABELS[value] }))];
}

function validateSearchRange(startDate, endDate) {
  if (startDate && endDate && startDate > endDate) {
    const error = new Error("结束日期不能早于开始日期");
    error.code = "INVALID_DATE_RANGE";
    throw error;
  }
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function decorateSearchResult(result) {
  const source = result && result.source === "plan" ? "plan" : "record";
  return {
    ...result,
    sourceLabel: source === "plan" ? "计划" : "记录",
    typeLabel: TYPE_LABELS[result && result.type] || "其他",
    dateText: formatDate(result && (result.occurredAt || result.createdAt))
  };
}

module.exports = {
  TYPE_LABELS,
  decorateSearchResult,
  typeOptionsForSource,
  validateSearchRange
};
