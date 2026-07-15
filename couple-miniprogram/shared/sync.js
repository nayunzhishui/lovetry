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

function mergeSyncChanges(current = {}, next = {}) {
  return ["records", "plans", "notifications"].reduce((result, key) => {
    result[key] = [
      ...(Array.isArray(current[key]) ? current[key] : []),
      ...(Array.isArray(next[key]) ? next[key] : [])
    ];
    return result;
  }, {});
}

module.exports = { mergeSyncChanges, parseSyncCursor, summarizeSyncChanges };
