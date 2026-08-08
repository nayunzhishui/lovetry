// 解绑冷静期策略：leave 只把空间置为 archiving，7 天后由定时触发器执行最终归档。
// 纯函数模块，便于在 tests/archive-policy.test.js 中单测；不依赖数据库与云环境。
const COOLING_OFF_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// 计算冷静期到期时间：now 起 7 天后
function computePurgeAt(now = new Date()) {
  const base = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(base)) return null;
  return new Date(base + COOLING_OFF_DAYS * DAY_MS);
}

// 判断空间是否已到期可归档：必须处于 archiving 且 scheduledPurgeAt 不晚于当前时间
function isPurgeDue(coupleDoc, now = new Date()) {
  if (!coupleDoc || coupleDoc.status !== "archiving" || !coupleDoc.scheduledPurgeAt) return false;
  const dueAt = new Date(coupleDoc.scheduledPurgeAt).getTime();
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(dueAt) && Number.isFinite(current) && dueAt <= current;
}

// 剩余天数（向上取整，最小 0）：用于"解除申请已发起，N 天后生效"文案
function remainingDays(coupleDoc, now = new Date()) {
  if (!coupleDoc || !coupleDoc.scheduledPurgeAt) return 0;
  const dueAt = new Date(coupleDoc.scheduledPurgeAt).getTime();
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(dueAt) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.ceil((dueAt - current) / DAY_MS));
}

module.exports = { COOLING_OFF_DAYS, computePurgeAt, isPurgeDue, remainingDays };
