const { executeWithRetry, getRequestPolicy } = require("../../shared/retry");

const ERROR_MESSAGES = {
  CLOUD_UNAVAILABLE: "云服务暂不可用，请稍后重试",
  CALL_FAILED: "请求失败，请稍后重试",
  NETWORK_ERROR: "网络异常，请检查网络后重试",
  REQUEST_TIMEOUT: "请求超时，请检查网络后重试",
  JOIN_CODE_REQUIRED: "请输入加入码",
  COUPLE_NOT_FOUND: "未找到对应的情侣空间",
  COUPLE_FULL: "该情侣空间已有两位成员",
  COUPLE_REQUIRED: "请先创建或加入情侣空间",
  ALREADY_IN_COUPLE: "当前账号已属于另一个情侣空间",
  INVALID_RECORD: "请检查记录内容后重试",
  RECORD_NOT_FOUND: "记录不存在或已删除",
  VERSION_CONFLICT: "记录已在另一台设备更新，请刷新后重试",
  INVALID_REACTION: "请选择有效回应",
  INVALID_PLAN: "请检查计划内容后重试",
  PLAN_NOT_FOUND: "计划不存在或已删除",
  INVALID_AMOUNT: "积分必须是大于零的整数",
  INVALID_TARGET: "请选择情侣空间内的成员",
  SELF_APPROVAL_NOT_ALLOWED: "奖励需要由伴侣确认",
  INSUFFICIENT_BALANCE: "当前积分余额不足",
  INVALID_ALBUM: "请填写相册名称",
  INVALID_ASSET: "图片信息不正确",
  TASK_NOT_FOUND: "未找到可结算的已完成任务",
  REWARD_ALREADY_SETTLED: "这项奖励已经结算",
  INVALID_REWARD_ITEM: "请填写有效的奖励名称和积分",
  UNSAFE_REWARD_ITEM: "这类约定不能作为积分奖励，请改为双方自愿沟通",
  REWARD_REVIEW_REQUIRED: "奖励需要由伴侣确认后才能兑换",
  REWARD_ITEM_NOT_FOUND: "奖励商品不存在或已下架",
  INVENTORY_NOT_FOUND: "仓库条目不存在",
  INVALID_REWARD_STATE: "奖励状态不能这样变更",
  IDEMPOTENCY_KEY_REQUIRED: "请求标识缺失，请重试",
  IDEMPOTENCY_CONFLICT: "重复请求内容不一致，请刷新后重试",
  ALBUM_NOT_FOUND: "相册不存在或已删除",
  ASSET_NOT_FOUND: "图片不存在或已删除",
  INVALID_PREFERENCES: "提醒设置不正确",
  NOTIFICATION_NOT_FOUND: "提醒不存在或无权访问",
  INVALID_RANGE: "请选择正确的日期范围",
  INVALID_SYNC_CURSOR: "同步位置已失效，请刷新页面",
  NO_PERMISSION: "无权访问这项数据",
  UNKNOWN_ACTION: "当前操作暂不支持"
};

function createApiError(code, message, cause) {
  const error = new Error(message || ERROR_MESSAGES[code] || ERROR_MESSAGES.CALL_FAILED);
  error.name = "CloudApiError";
  error.code = code || "CALL_FAILED";
  error.userMessage = ERROR_MESSAGES[error.code] || error.message;
  if (cause) error.cause = cause;
  return error;
}

function findKnownCode(message) {
  const text = String(message || "");
  return Object.keys(ERROR_MESSAGES).find((code) => text.includes(code)) || "";
}

function normalizeError(error) {
  if (error && error.name === "CloudApiError") return error;
  if (error && error.code === "REQUEST_TIMEOUT") {
    return createApiError("REQUEST_TIMEOUT", "", error);
  }

  const message = error && (error.errMsg || error.message);
  const knownCode = findKnownCode(message);
  if (knownCode) return createApiError(knownCode, "", error);

  const isNetworkError = /network|timeout|request:fail|callFunction:fail/i.test(String(message || ""));
  return createApiError(isNetworkError ? "NETWORK_ERROR" : "CALL_FAILED", "", error);
}

function normalizeResult(result) {
  if (result && result.ok === false) {
    const detail = result.error || {};
    throw createApiError(detail.code || "CALL_FAILED", detail.message);
  }

  if (result && result.ok === true) {
    return Object.prototype.hasOwnProperty.call(result, "data") ? result.data : null;
  }

  return result || {};
}

function call(name, data) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== "function") {
    return Promise.reject(createApiError("CLOUD_UNAVAILABLE"));
  }

  const traceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const payload = Object.assign({}, data || {}, { _traceId: traceId });
  const policy = getRequestPolicy(name, payload.action || "");

  return executeWithRetry(
    () => wx.cloud
      .callFunction({ name, data: payload })
      .then((response) => normalizeResult(response && response.result)),
    {
      ...policy,
      shouldRetry(error) {
        const normalized = normalizeError(error);
        return normalized.code === "NETWORK_ERROR" || normalized.code === "REQUEST_TIMEOUT";
      }
    }
  )
    .catch((error) => Promise.reject(normalizeError(error)));
}

function records(action, data) {
  return call("records", Object.assign({}, data || {}, { action }));
}

function plans(action, data) {
  return call("plans", Object.assign({}, data || {}, { action }));
}

function rewards(action, data) {
  return call("rewards", Object.assign({}, data || {}, { action }));
}

function media(action, data) {
  return call("media", Object.assign({}, data || {}, { action }));
}

function dashboard(action, data) {
  return call("dashboard", Object.assign({}, data || {}, { action }));
}

function notifications(action, data) {
  return call("notifications", Object.assign({}, data || {}, { action }));
}

function login() {
  return call("login");
}

function getMyCouple() {
  return call("couple", { action: "mine" }).then((result) => result.couple || null);
}

function createCouple() {
  return call("couple", { action: "create" }).then((result) => result.couple || null);
}

function joinCouple(code) {
  return call("couple", { action: "join", code }).then((result) => result.couple || null);
}

function createRecord(record) {
  return records("create", { record }).then((result) => result.record || null);
}

function listRecords(options) {
  return records("list", options).then((result) => result.records || []);
}

function getRecord(recordId) {
  return records("get", { recordId }).then((result) => result.record || null);
}

function updateRecord(recordId, version, record) {
  return records("update", { recordId, version, record }).then(
    (result) => result.record || null
  );
}

function deleteRecord(recordId) {
  return records("delete", { recordId }).then((result) => result.recordId || recordId);
}

function cleanupTestData() {
  return records("cleanupTestData");
}

function getRecordStats(type) {
  return records("stats", { type }).then((result) => result.stats || null);
}

function listSharedFeed() {
  return records("feed").then((result) => result.records || []);
}

function reactToRecord(recordId, reaction, idempotencyKey) {
  return records("react", { recordId, reaction, idempotencyKey }).then((result) => result.record);
}

function createPlan(plan) {
  return plans("create", { plan }).then((result) => result.plan || null);
}

function listPlans(options) {
  return plans("list", options).then((result) => ({
    plans: result.plans || [],
    page: result.page || { offset: 0, limit: 0, hasMore: false }
  }));
}

function getPlan(planId) {
  return plans("get", { planId }).then((result) => result.plan || null);
}

function updatePlan(planId, version, plan) {
  return plans("update", { planId, version, plan }).then((result) => result.plan || null);
}

function setPlanStatus(planId, status, version) {
  return plans("setStatus", { planId, status, version }).then((result) => result.plan || null);
}

function togglePlanChecklist(planId, index, version) {
  return call("plans", { action: "toggleChecklist", planId, index, version }).then((data) => data.plan);
}

function deletePlan(planId, version) {
  return plans("delete", { planId, version }).then((result) => result.planId || planId);
}

function randomMenu(excludeIds) {
  return plans("randomMenu", { excludeIds: excludeIds || [] }).then((result) => result.plan || null);
}

function getRewardSummary() {
  return rewards("summary").then((result) => ({ wallets: result.wallets || [] }));
}

function listRewardTransactions(options) {
  return rewards("list", options).then((result) => result.transactions || []);
}

function grantReward(data) {
  return rewards("grant", data);
}

function spendReward(data) {
  return rewards("spend", data);
}

function settleTaskReward(data) {
  return rewards("settleTask", data);
}

function listPendingRewardTasks() {
  return call("rewards", { action: "pendingTasks" }).then((data) => data.tasks || []);
}

function listRewardCatalog() {
  return rewards("listCatalog").then((result) => result.items || []);
}

function createRewardItem(item) {
  return rewards("createItem", { item }).then((result) => result.item);
}

function reviewRewardItem(itemId, status) {
  return rewards("reviewItem", { itemId, status }).then((result) => result.item);
}

function archiveRewardItem(itemId) {
  return rewards("archiveItem", { itemId });
}

function redeemRewardItem(itemId, idempotencyKey) {
  return rewards("redeemItem", { itemId, idempotencyKey }).then((result) => result.inventory);
}

function listRewardInventory() {
  return rewards("listInventory").then((result) => result.inventory || []);
}

function setRewardInventoryStatus(inventoryId, status) {
  return rewards("setInventoryStatus", { inventoryId, status }).then((result) => result.inventory);
}

function createAlbum(album) {
  return media("createAlbum", { album }).then((result) => result.album || null);
}

function listAlbums() {
  return media("listAlbums").then((result) => result.albums || []);
}

function updateAlbum(albumId, album) {
  return media("updateAlbum", { albumId, album }).then((result) => result.album || null);
}

function deleteAlbum(albumId) {
  return media("deleteAlbum", { albumId });
}

function addMediaAsset(asset) {
  return media("addAsset", { asset }).then((result) => result.asset || null);
}

function listMediaAssets(options) {
  return media("listAssets", options).then((result) => ({
    assets: result.assets || [],
    page: result.page || { offset: 0, limit: 0, hasMore: false }
  }));
}

function listAssets(albumId, options) {
  return listMediaAssets(Object.assign({}, options || {}, { albumId })).then((result) => result.assets);
}

function addAsset(asset) {
  return addMediaAsset(asset);
}

function deleteAsset(assetId) {
  return deleteMediaAsset(assetId);
}

function deleteMediaAsset(assetId) {
  return media("deleteAsset", { assetId });
}

function getDashboardSummary() {
  return dashboard("summary");
}

function getCalendarEvents(startAt, endAt) {
  return dashboard("calendar", { startAt, endAt }).then((result) => result.events || []);
}

function searchDashboard(keyword, options = {}) {
  return dashboard("search", { keyword, ...options }).then((result) => result.results || []);
}

function searchAll(keyword, options) {
  return searchDashboard(keyword, options);
}

function syncSince(since, offsets = {}) {
  return dashboard("sync", { since, offsets });
}

function exportData() {
  return dashboard("export").then((result) => result.exportData || null);
}

function importData(backup) {
  return dashboard("import", { backup }).then((result) => result.counts);
}

function getServiceHealth() {
  return dashboard("health");
}

function getNotificationPreferences() {
  return notifications("getPreferences").then((result) => result.preferences);
}

function updateNotificationPreferences(preferences) {
  return notifications("updatePreferences", { preferences }).then((result) => result.preferences);
}

function registerNotificationSubscription(templateIds) {
  return notifications("registerSubscription", { templateIds });
}

function previewNotifications() {
  return notifications("preview").then((result) => result.reminders || []);
}

function materializeMyNotifications() {
  return notifications("materializeMine").then((result) => result.reminders || []);
}

function listNotifications() {
  return notifications("list").then((result) => result.notifications || []);
}

function markNotificationRead(notificationId) {
  return notifications("markRead", { notificationId });
}

function askLoveAgent(question, history, context) {
  return call("love-agent", {
    action: "ask",
    question,
    history: Array.isArray(history) ? history : [],
    context: context || null
  });
}

function getLoveAgentProviderStatus(probe) {
  return call("love-agent", {
    action: "providerStatus",
    probe: Boolean(probe)
  });
}

function getErrorMessage(error, fallback) {
  if (error && error.code === "CALL_FAILED" && fallback) return fallback;
  if (error && error.userMessage) return error.userMessage;
  const normalized = normalizeError(error);
  if (normalized.code === "CALL_FAILED" && fallback) return fallback;
  return normalized.userMessage || fallback || ERROR_MESSAGES.CALL_FAILED;
}

module.exports = {
  call,
  records,
  plans,
  rewards,
  media,
  dashboard,
  notifications,
  login,
  getMyCouple,
  createCouple,
  joinCouple,
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  cleanupTestData,
  getRecordStats,
  listSharedFeed,
  reactToRecord,
  createPlan,
  listPlans,
  getPlan,
  updatePlan,
  setPlanStatus,
  togglePlanChecklist,
  deletePlan,
  randomMenu,
  getRewardSummary,
  listRewardTransactions,
  grantReward,
  spendReward,
  settleTaskReward,
  listPendingRewardTasks,
  listRewardCatalog,
  createRewardItem,
  reviewRewardItem,
  archiveRewardItem,
  redeemRewardItem,
  listRewardInventory,
  setRewardInventoryStatus,
  createAlbum,
  listAlbums,
  updateAlbum,
  deleteAlbum,
  addMediaAsset,
  listMediaAssets,
  deleteMediaAsset,
  listAssets,
  addAsset,
  deleteAsset,
  getDashboardSummary,
  getCalendarEvents,
  searchDashboard,
  searchAll,
  syncSince,
  exportData,
  importData,
  getServiceHealth,
  getNotificationPreferences,
  updateNotificationPreferences,
  registerNotificationSubscription,
  previewNotifications,
  materializeMyNotifications,
  listNotifications,
  markNotificationRead,
  askLoveAgent,
  getLoveAgentProviderStatus,
  getErrorMessage
};
