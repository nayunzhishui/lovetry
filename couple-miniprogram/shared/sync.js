const { DomainError } = require("./errors");

function parseSyncCursor(value, now = new Date()) {
  const cursor = new Date(value || 0);
  if (Number.isNaN(cursor.getTime()) || cursor.getTime() > now.getTime() + 300000) {
    throw new DomainError("INVALID_SYNC_CURSOR", "同步游标无效，请执行完整刷新");
  }
  return cursor;
}

function summarizeSyncChanges(changes) {
  const records = Array.isArray(changes && changes.records) ? changes.records.length : 0;
  const plans = Array.isArray(changes && changes.plans) ? changes.plans.length : 0;
  const notifications = Array.isArray(changes && changes.notifications) ? changes.notifications.length : 0;
  return { total: records + plans + notifications, records, plans, notifications };
}

// 将同步摘要转成首页可读的中文短语；分量为 0 时省略，全部为 0 返回空串。
// 变更中可能混有本机写入的内容，因此用中性的"有 N 条记录更新"而不是"TA 更新了"。
function describeSyncDigest(summary) {
  const source = summary || {};
  const records = Number(source.records) || 0;
  const plans = Number(source.plans) || 0;
  const notifications = Number(source.notifications) || 0;
  const parts = [];
  if (records > 0) parts.push(`${records} 条记录`);
  if (plans > 0) parts.push(`${plans} 个计划`);
  if (notifications > 0) parts.push(`${notifications} 条提醒`);
  if (parts.length === 0) return "";
  return `有 ${parts.join("、")}更新`;
}

function mergeSyncChanges(current = {}, next = {}) {
  return ["records", "plans", "notifications"].reduce((result, key) => {
    const combined = [
      ...(Array.isArray(current[key]) ? current[key] : []),
      ...(Array.isArray(next[key]) ? next[key] : [])
    ];
    const byId = new Map();
    combined.forEach((item, index) => {
      byId.set(item && item._id ? item._id : `${key}:${index}`, item);
    });
    result[key] = [...byId.values()];
    return result;
  }, {});
}

function normalizeSyncOffsets(offsets = {}) {
  return ["records", "plans", "notifications"].reduce((result, key) => {
    result[key] = Math.min(Math.max(Number(offsets && offsets[key]) || 0, 0), 100000);
    return result;
  }, {});
}

module.exports = { describeSyncDigest, mergeSyncChanges, normalizeSyncOffsets, parseSyncCursor, summarizeSyncChanges };
