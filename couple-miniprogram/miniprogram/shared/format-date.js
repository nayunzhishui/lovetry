// 中文日期格式化：手写拼接保证安卓 / iOS 输出一致，替代 toLocaleString
function toValidDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

// "2026年7月26日"
function formatDate(value) {
  const date = toValidDate(value);
  if (!date) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// "2026年7月26日 14:30"
function formatDateTime(value) {
  const date = toValidDate(value);
  if (!date) return "";
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// "7月26日"
function formatDay(value) {
  const date = toValidDate(value);
  if (!date) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// 紧凑型 "2026.07.26 14:30"：用于列表元信息等窄空间场景
function formatCompact(value) {
  const date = toValidDate(value);
  if (!date) return "";
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

module.exports = {
  formatCompact,
  formatDate,
  formatDateTime,
  formatDay
};
