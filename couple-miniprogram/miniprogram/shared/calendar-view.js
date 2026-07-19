const TYPE_LABELS = {
  moment: "日记",
  mood: "心情",
  conflict: "沟通",
  outing: "玩乐",
  sleep: "睡眠",
  period: "生理期",
  intimacy: "亲密",
  game: "游戏",
  pomodoro: "专注",
  task: "任务",
  event: "事件",
  menu: "菜单",
  trip: "旅行",
  anniversary: "纪念日"
};

const STATUS_LABELS = {
  todo: "待完成",
  doing: "进行中",
  done: "已完成",
  archived: "已归档"
};

function timeText(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function presentCalendarEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map((event) => ({
      ...event,
      typeLabel: TYPE_LABELS[event.type] || "事项",
      sourceLabel: event.source === "plan" ? "共同计划" : "生活记录",
      statusLabel: STATUS_LABELS[event.status] || "",
      timeText: event.source === "plan" ? "全天" : timeText(event.startAt)
    }))
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
}

module.exports = { presentCalendarEvents };
